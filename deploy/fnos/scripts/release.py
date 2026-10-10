#!/usr/bin/env python3
"""单仓库发布 FPK 到 GitHub 或 Gitea；凭据仅驻留内存。作者：jingyh。"""
import argparse
import base64
import getpass
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid


def git(repo, *args, env=None):
    """运行 Git 并返回结果；失败时不输出可能包含认证信息的原始诊断。"""
    result = subprocess.run(['git', '-C', str(repo), *args], env=env,
                            capture_output=True, text=True, encoding='utf-8')
    if result.returncode:
        # 保留可操作的 Git 诊断，但剔除本进程内注入的认证头。
        detail = result.stderr.strip()
        for key, value in (env or {}).items():
            if key.startswith('GIT_CONFIG_VALUE_') and value:
                detail = detail.replace(value, '[认证信息已隐藏]')
                if value.startswith('Authorization: '):
                    detail = detail.replace(value.split(' ', 2)[-1], '[认证信息已隐藏]')
        detail = re.sub(r'(https?://)[^/@\s]+:[^/@\s]+@', r'\1[认证信息已隐藏]@', detail)
        raise RuntimeError('Git 操作失败：' + ' '.join(args[:2]) + '\n' + detail[-2000:])
    return result.stdout.strip()


def repository(repo, remote='origin'):
    """从指定远端推导 API，拒绝仓库地址中携带密码。"""
    origin = git(repo, 'remote', 'get-url', remote)
    url = urllib.parse.urlsplit(origin)
    if url.scheme not in ('http', 'https') or url.username or url.password:
        raise RuntimeError('发布远端必须是无凭据的 HTTP/HTTPS 地址')
    segments = url.path.strip('/').removesuffix('.git').split('/')
    if len(segments) != 2:
        raise RuntimeError('origin 不是 owner/repository 地址')
    base = url.scheme + '://' + url.netloc
    api = ('https://api.github.com/repos/' if url.hostname == 'github.com' else base + '/api/v1/repos/')
    return origin, base, api + '/'.join(segments)


class Gitea:
    """不跟随重定向，避免仓库访问凭据传往其他服务器。"""
    def __init__(self, username, password):
        self.header = 'Basic ' + base64.b64encode((username + ':' + password).encode()).decode()
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, url, method='GET', data=None, content_type='application/json', allow_missing=False):
        """仅将 HTTP 状态作为失败诊断，不打印服务器正文和认证头。"""
        if isinstance(data, dict):
            data = json.dumps(data, ensure_ascii=False).encode()
        request = urllib.request.Request(url, data=data, method=method, headers={
            'Authorization': self.header, 'Accept': 'application/json', 'Content-Type': content_type,
        })
        try:
            with self.opener.open(request, timeout=120) as response:
                body = response.read()
                return json.loads(body) if body else None
        except urllib.error.HTTPError as error:
            if allow_missing and error.code == 404:
                return None
            raise RuntimeError(f'{type(self).__name__} {method} 失败：HTTP {error.code}') from None

    def upload(self, api, release, file):
        """上传发布附件并核对名称及长度，使用 Gitea attachment 表单字段。"""
        boundary = uuid.uuid4().hex
        payload = file.read_bytes()
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="attachment"; filename="{file.name}"\r\n'
                'Content-Type: application/octet-stream\r\n\r\n').encode() + payload + f'\r\n--{boundary}--\r\n'.encode()
        asset = self.request(api + f'/releases/{release["id"]}/assets?name=' + urllib.parse.quote(file.name),
                             'POST', body, 'multipart/form-data; boundary=' + boundary)
        if asset.get('name') != file.name or asset.get('size') != len(payload):
            raise RuntimeError('发布附件校验失败')
        # 回读附件字节，确认下载内容与本地安装包完全一致。
        # Gitea ROOT_URL 可能仍是旧域名；认证请求固定使用配置中的仓库主机。
        origin = urllib.parse.urlsplit(api)
        location = urllib.parse.urlsplit(asset['browser_download_url'])
        download_url = urllib.parse.urlunsplit((origin.scheme, origin.netloc, location.path, location.query, ''))
        request = urllib.request.Request(download_url, headers={'Authorization': self.header})
        with self.opener.open(request, timeout=120) as response:
            remote = response.read()
        if hashlib.sha256(remote).digest() != hashlib.sha256(payload).digest():
            raise RuntimeError('发布附件 SHA256 不一致')
        return asset


class NodeOpener:
    """复用服务所需 Node 的 HTTPS 客户端，凭据通过标准输入传递。"""
    def open(self, request, timeout=120):
        result = subprocess.run(['node', str(Path(__file__).with_name('release-http.js'))],
                                input=json.dumps({
                                    'url': request.full_url, 'method': request.get_method(),
                                    'headers': dict(request.header_items()), 'timeout': timeout * 1000,
                                    'body': base64.b64encode(request.data).decode() if request.data is not None else None,
                                }), capture_output=True, text=True, timeout=timeout + 10)
        if result.returncode:
            raise RuntimeError('Node HTTPS 请求失败，请检查网络连接')
        response = json.loads(result.stdout)
        body = io.BytesIO(base64.b64decode(response['body']))
        if response['status'] >= 300:
            raise urllib.error.HTTPError(request.full_url, response['status'], 'HTTP 请求失败', response['headers'], body)
        return body


class GitHub(Gitea):
    """GitHub 草稿附件通过 API 上传并回读，重定向请求不携带令牌。"""
    def __init__(self, token):
        super().__init__('', '')
        self.header = 'Bearer ' + token
        self.opener = NodeOpener()

    def upload(self, api, release, file):
        payload = file.read_bytes()
        upload_api = api.replace('https://api.github.com/', 'https://uploads.github.com/')
        asset = self.request(upload_api + f'/releases/{release["id"]}/assets?name=' + urllib.parse.quote(file.name),
                             'POST', payload, 'application/octet-stream')
        if asset.get('name') != file.name or asset.get('size') != len(payload):
            raise RuntimeError('GitHub 发布附件名称或长度不一致')
        request = urllib.request.Request(api + f'/releases/assets/{asset["id"]}', headers={
            'Authorization': self.header, 'Accept': 'application/octet-stream',
        })
        try:
            with self.opener.open(request, timeout=120) as response:
                remote = response.read()
        except urllib.error.HTTPError as error:
            location = error.headers.get('location') or error.headers.get('Location', '')
            if error.code != 302 or urllib.parse.urlsplit(location).scheme != 'https':
                raise RuntimeError(f'GitHub 附件回读失败：HTTP {error.code}') from None
            # GitHub 返回签名下载地址；不能把 API 令牌发送给存储服务器。
            with self.opener.open(urllib.request.Request(location), timeout=120) as response:
                remote = response.read()
        if hashlib.sha256(remote).digest() != hashlib.sha256(payload).digest():
            raise RuntimeError('GitHub 发布附件 SHA256 不一致')
        return asset


def validate_version(version, official):
    """本仓库始终使用官方版本的补丁号加一，不允许任意高版本。"""
    if not re.fullmatch(r'\d+\.\d+\.\d+', version) or not re.fullmatch(r'v?\d+\.\d+\.\d+', official):
        raise RuntimeError('版本必须为标准 major.minor.patch 格式')
    major, minor, patch = map(int, official.removeprefix('v').split('.'))
    expected = f'{major}.{minor}.{patch + 1}'
    if version != expected:
        raise RuntimeError(f'官方为 {official}，本仓库应使用 {expected}')


def github_token(repo, origin):
    """优先使用环境令牌，其次读取已配置的 Git 凭据，不写入磁盘。"""
    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
    if token:
        return token
    env = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'Never'}
    result = subprocess.run(['git', '-C', str(repo), 'credential', 'fill'],
                            input='url=' + origin + '\n\n', capture_output=True, text=True, env=env)
    fields = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    if result.returncode == 0 and fields.get('password'):
        return fields['password']
    if sys.stdin.isatty():
        return getpass.getpass('GitHub token (hidden): ')
    raise RuntimeError('未找到 GitHub 写入凭据，请配置 Git 凭据或 GH_TOKEN')


def main():
    """先校验单仓库版本与产物，再推送标签并发布草稿附件。"""
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true', help='只验证官方版本和远端写入权限')
    parser.add_argument('--remote', default='origin', help='发布远端，默认为 origin')
    parser.add_argument('--username', help='发布到 Gitea 时的账号')
    args = parser.parse_args()
    pack = Path(__file__).resolve().parent.parent
    repo = pack.parent.parent
    origin, base, api = repository(repo, args.remote)
    version = json.loads((repo / 'package.json').read_text(encoding='utf-8'))['version']
    request = urllib.request.Request('https://api.github.com/repos/XCQ0607/lxserver/releases/latest',
                                     headers={'User-Agent': 'llxserver-release'})
    with NodeOpener().open(request, timeout=30) as response:
        official = json.load(response)['tag_name']
    validate_version(version, official)
    tag = 'v' + version
    if base == 'https://github.com':
        client = GitHub(github_token(repo, origin))
    else:
        if not args.username:
            raise RuntimeError('Gitea 发布需要 --username')
        client = Gitea(args.username, getpass.getpass('Gitea password (hidden): '))
    info = client.request(api)
    if not info.get('permissions', {}).get('push'):
        raise RuntimeError('账号没有仓库写入权限')
    print(f'版本与仓库写入权限通过：{tag} / {info["full_name"]}', flush=True)
    if args.check:
        return
    if git(repo, 'status', '--porcelain'):
        raise RuntimeError('仓库尚有未提交内容，请先提交')
    manifest = (pack / 'levis.lxserver/manifest').read_text(encoding='utf-8')
    if re.search(r'^version\s*=\s*(\S+)', manifest, re.M).group(1) != version:
        raise RuntimeError('FPK 与源码版本不一致，请重新构建')
    artifact = pack / 'dist' / f'levis.lxserver-{tag}.fpk'
    checksum_file = Path(str(artifact) + '.sha256')
    if checksum_file.read_text(encoding='utf-8').split()[0] != hashlib.sha256(artifact.read_bytes()).hexdigest():
        raise RuntimeError('安装包校验文件不匹配')
    notes = (pack / 'releases' / f'{tag}.md').read_text(encoding='utf-8')
    if client.request(api + '/releases/tags/' + tag, allow_missing=True):
        raise RuntimeError('该版本已有发布，禁止覆盖')
    commit = git(repo, 'rev-parse', 'HEAD')
    if git(repo, 'tag', '--list', tag):
        if git(repo, 'rev-parse', tag + '^{}') != commit:
            raise RuntimeError('本地标签指向其他提交，禁止覆盖')
    else:
        git(repo, 'tag', '-a', tag, '-m', 'Release ' + tag)
    branch = git(repo, 'branch', '--show-current')
    if not branch:
        raise RuntimeError('需要在发布分支中执行')
    env = {**os.environ, 'GIT_CONFIG_COUNT': '2', 'GIT_CONFIG_KEY_0': 'credential.helper', 'GIT_CONFIG_VALUE_0': '',
           'GIT_CONFIG_KEY_1': 'http.' + base + '/.extraHeader', 'GIT_CONFIG_VALUE_1': 'Authorization: ' + client.header,
           'GIT_TERMINAL_PROMPT': '0'}
    # GitHub 的 Git HTTP 使用 Basic 认证，API 使用 Bearer；两者不能混用。
    if isinstance(client, GitHub):
        token = client.header.removeprefix('Bearer ')
        basic = base64.b64encode(('x-access-token:' + token).encode()).decode()
        env['GIT_CONFIG_VALUE_1'] = 'Authorization: Basic ' + basic
    git(repo, 'push', '--atomic', args.remote, 'HEAD:refs/heads/' + branch, 'refs/tags/' + tag, env=env)
    release = client.request(api + '/releases', 'POST', {
        'tag_name': tag, 'target_commitish': commit, 'name': tag, 'body': notes, 'draft': True, 'prerelease': False,
    })
    client.upload(api, release, artifact)
    client.upload(api, release, checksum_file)
    release = client.request(api + f'/releases/{release["id"]}', 'PATCH', {'draft': False})
    print('发布完成：' + release['html_url'], flush=True)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        main()
    except Exception as error:
        print('发布未完成：' + str(error), flush=True)
        raise SystemExit(1)
