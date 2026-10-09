"""发布流程的认证隔离、附件回读和错误处理测试。作者：jingyh。"""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTest(unittest.TestCase):
    def test_version_is_one_patch_above_official(self):
        """标准版本严格遵循官方补丁号加一。"""
        release.validate_version('2.1.3', 'v2.1.2')
        release.validate_version('2.2.1', 'v2.2.0')
        for version in ['2.1.2', '2.1.4', 'v2.1.3', 'v_jyh_2.1.3']:
            with self.assertRaises(RuntimeError):
                release.validate_version(version, 'v2.1.2')

    def test_github_origin_uses_github_api(self):
        """当前仓库推导正确 GitHub API，不使用旧 Gitea 路径。"""
        with patch.object(release, 'git', return_value='https://github.com/yahyaoo/fn-lxserver.git'):
            self.assertEqual(release.repository(Path('.'))[2], 'https://api.github.com/repos/yahyaoo/fn-lxserver')

    def test_github_upload_checks_downloaded_bytes(self):
        """GitHub 原始附件上传后仍需 SHA256 回读校验。"""
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp) / 'fixture.fpk'
            file.write_bytes(b'package')
            client = release.GitHub('test-token')
            asset = {'id': 5, 'name': file.name, 'size': 7}
            with patch.object(client, 'request', return_value=asset) as upload:
                with patch.object(client.opener, 'open', return_value=io.BytesIO(b'package')):
                    self.assertEqual(client.upload('https://api.github.com/repos/owner/repo', {'id': 1}, file), asset)
                self.assertTrue(upload.call_args.args[0].startswith('https://uploads.github.com/'))
                with patch.object(client.opener, 'open', return_value=io.BytesIO(b'changed')):
                    with self.assertRaisesRegex(RuntimeError, 'SHA256'):
                        client.upload('https://api.github.com/repos/owner/repo', {'id': 1}, file)

    def test_github_redirect_never_forwards_token(self):
        """签名附件地址通过无认证请求回读。"""
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp) / 'fixture.fpk'
            file.write_bytes(b'package')
            client = release.GitHub('private-test-token')
            redirect = urllib.error.HTTPError('https://api.github.com/asset', 302, 'redirect',
                                             {'Location': 'https://storage.example/signed'}, None)
            with patch.object(client, 'request', return_value={'id': 1, 'name': file.name, 'size': 7}), \
                 patch.object(client.opener, 'open', side_effect=[redirect, io.BytesIO(b'package')]) as download:
                client.upload('https://api.github.com/repos/owner/repo', {'id': 1}, file)
                request = download.call_args.args[0]
                self.assertEqual(request.full_url, 'https://storage.example/signed')
                self.assertEqual(request.has_header('Authorization'), False)

    def test_origin_rejects_embedded_credentials(self):
        """仓库地址不能包含密码；凭据仅放进程认证头。"""
        with patch.object(release, 'git', return_value='http://name:secret@example.com/owner/repo.git'):
            with self.assertRaises(RuntimeError):
                release.repository(Path('.'))

    def test_gitea_errors_do_not_reveal_body(self):
        """API 报错只输出状态码，不暴露服务端响应中的敏感文本。"""
        client = release.Gitea('test', 'ephemeral-test-password')
        error = urllib.error.HTTPError('https://example.com/api', 401, 'bad', {}, io.BytesIO(b'private-detail'))
        with patch.object(client.opener, 'open', side_effect=error):
            with self.assertRaisesRegex(RuntimeError, 'HTTP 401') as caught:
                client.request('https://example.com/api')
        self.assertNotIn('private-detail', str(caught.exception))
        self.assertNotIn('ephemeral-test-password', str(caught.exception))

    def test_upload_roundtrip_rejects_changed_bytes(self):
        """同长度的错误附件也必须通过回读 SHA256 被拒绝。"""
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp) / 'example.fpk'
            file.write_bytes(b'valid-package')
            client = release.Gitea('test', 'test-password')
            asset = {'name': file.name, 'size': file.stat().st_size, 'browser_download_url': 'https://example.com/attachment'}
            with patch.object(client, 'request', return_value=asset), patch.object(client.opener, 'open', return_value=io.BytesIO(b'bad-package!!')):
                with self.assertRaisesRegex(RuntimeError, 'SHA256'):
                    client.upload('https://example.com/api', {'id': 1}, file)
            with patch.object(client, 'request', return_value=asset), patch.object(client.opener, 'open', return_value=io.BytesIO(file.read_bytes())):
                self.assertEqual(client.upload('https://example.com/api', {'id': 1}, file), asset)

    def test_attachment_download_uses_configured_origin(self):
        """Gitea 返回旧域名时，不把发布凭据发送给旧主机。"""
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp) / 'example.fpk'
            file.write_bytes(b'package')
            client = release.Gitea('test', 'test-password')
            asset = {'name': file.name, 'size': 7, 'browser_download_url': 'http://old.example/attachments/id'}
            def download(request, **kwargs):
                self.assertEqual(request.full_url, 'https://current.example/attachments/id')
                return io.BytesIO(file.read_bytes())
            with patch.object(client, 'request', return_value=asset), patch.object(client.opener, 'open', side_effect=download):
                client.upload('https://current.example/api', {'id': 1}, file)


if __name__ == '__main__':
    unittest.main()
