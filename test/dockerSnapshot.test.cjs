/** Docker snapshot 标签和配置隔离回归。 @author yahyaoo */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { imageTags } = require('../deploy/scripts/docker-tags.cjs');

test('snapshot 使用独立标签，正式构建继续使用版本标签', () => {
  assert.deepEqual(imageTags('2.1.5', 'tag', 'v2.1.5-snapshot.20261012.abc1234'), { tag: '2.1.5-snapshot.20261012.abc1234', snapshot: true });
  assert.deepEqual(imageTags('2.1.5', 'tag', 'v2.1.5'), { tag: '2.1.5', snapshot: false });
  assert.deepEqual(imageTags('2.1.5', 'branch', 'dev'), { tag: '2.1.5', snapshot: false });
});
test('拒绝版本不符、空后缀、非法字符和过长的镜像标签', () => {
  for (const ref of ['v2.1.4-snapshot.abc', 'v2.1.5-snapshot.', 'v2.1.5-snapshot.x\nlatest', 'v2.1.5-snapshot.' + 'x'.repeat(128)]) assert.throws(() => imageTags('2.1.5', 'tag', ref));
  assert.throws(() => imageTags('2.1.5-snapshot', 'tag', 'v2.1.5-snapshot.x'));
});
test('工作流触发 snapshot 并隔离 latest、正式版本与 Docker Hub 发布', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/docker.yml'), 'utf8');
  assert.match(workflow, /push:\s*tags:\s*- 'v\*-snapshot\.\*'/);
  assert.match(workflow, /node deploy\/scripts\/docker-tags\.cjs/);
  assert.match(workflow, /value=latest,enable=\$\{\{ env\.IS_SNAPSHOT != 'true' \}\}/);
  assert.match(workflow, /value=\$\{\{ env\.IMAGE_TAG \}\}/);
  assert.match(workflow, /name=\$\{\{ env\.DOCKER_HUB_REPO \}\}.*enable=\$\{\{ env\.IS_SNAPSHOT != 'true' \}\}/);
});
test('客户端镜像不复制开发机配置', () => {
  const dockerfile = fs.readFileSync(path.join(__dirname, '../deploy/docker/client.Dockerfile'), 'utf8');
  assert.doesNotMatch(dockerfile, /^COPY config\.js/m);
  assert.match(dockerfile, /module\.exports = \{\}/);
});
