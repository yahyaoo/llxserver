/** 03：真实 SQLite 的迟到播放去重、重启与账号隔离。 @author jingyh */
require('tsx/cjs');
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createMusicRepository } = require('../server/music/repository/MusicRepository.ts');
const { ExperienceRepository } = require('../server/music/repository/ExperienceRepository.ts');
const { PlayCountService, confirmedPlaybackIds, getConfirmedRoamingWeights } = require('../server/music/service/PlayCountService.ts');
const { getRoamingWeights, setRoamingWeightProvider } = require('../server/music/service/RoamingService.ts');
test('同首 A→B→A 不双计，清历史/重启不清确认，同账号新播放仍加权', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-playback-acks-'));
    let database = createMusicRepository(root);
    const repository = name => new ExperienceRepository(database, path.join(root, 'users', name));
    const input = playbackId => ({ id: 'wy_1', source: 'wy', songmid: '1', name: '歌曲', playbackSucceeded: true, playedSeconds: 11, playbackId });
    try {
        let alice = repository('alice'), counter = new PlayCountService(alice);
        counter.record(input('A'), 100); counter.record(input('B'), 100); counter.record(input('A'), 100);
        assert.equal(counter.get()[0].playCount, 2); assert.equal((await getRoamingWeights('alice', alice)).counts['wy:1'], 2);
        assert.deepEqual(new Set(confirmedPlaybackIds(alice)), new Set(['A', 'B']));
        alice.write('client_recent_play', 'recent-play.json', []);
        database.close(); database = createMusicRepository(root); alice = repository('alice'); counter = new PlayCountService(alice);
        counter.record(input('A'), 100); assert.equal(counter.get().length, 0);
        counter.record(input('C'), 100); assert.equal((await getRoamingWeights('alice', alice)).counts['wy:1'], 3);
        const bob = repository('bob'); new PlayCountService(bob).record(input('A'), 100);
        assert.deepEqual(confirmedPlaybackIds(bob), ['A']); assert.equal((await getRoamingWeights('bob', bob)).counts['wy:1'], 1);
        assert.throws(() => counter.record({ ...input('invalid'), playedSeconds: 10 }, 100), /超过 10 秒/);
        assert.equal(confirmedPlaybackIds(alice).includes('invalid'), false);
        let release;
        setRoamingWeightProvider(() => new Promise(resolve => { release = resolve; }));
        const snapshot = getConfirmedRoamingWeights('alice', alice);
        counter.record(input('during-extras'), 100); release({});
        const weights = await snapshot;
        assert.equal(weights.counts['wy:1'], 3);
        assert.equal(weights.confirmedPlaybackIds.includes('during-extras'), false);
        assert.equal(confirmedPlaybackIds(alice).includes('during-extras'), true);
    } finally { setRoamingWeightProvider(async () => ({})); database.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
