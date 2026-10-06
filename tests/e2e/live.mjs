// Live shared workout (phase 1: server + phone), WATCH_BRIDGE.md A17. Two real app pages act as two
// devices on one account; their Supabase client is a stub that forwards every live_workouts call to
// ONE in-memory row held here in Node, with PostgREST's semantics for what the app uses (maybeSingle
// select, insert -> 23505 on a second row, update ... eq(rev) -> [] when the version moved). Every
// other table answers with an error, and the stub records writes to them, so the tests can also
// prove the live path never touches the whole-blob backup.
import { phone, check } from './harness.mjs';

const CEX = [
  { id: 'cex1', name: 'Barbell Bench Press', muscle: 'chest', equip: 'barbell', tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true },
  { id: 'cex2', name: 'Barbell Row', muscle: 'back', equip: 'barbell', tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true },
];
const SEED = { cex: CEX, routines: [{ id: 'r1', name: 'Push', desc: '', exercises: ['cex1'] }] };
const wait = ms => new Promise(r => setTimeout(r, ms));
const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

function makeDb() {
  const db = { row: null, ops: [], casMiss: 0, offline: new Set(), other: [], gate: null };
  // Hold the next n reads until all n have arrived, so two devices read the same rev and race.
  db.barrier = n => {
    const waiting = [];
    const release = () => { db.gate = null; waiting.splice(0).forEach(f => f()); };
    setTimeout(release, 3000);   // never hang the suite
    db.gate = { wait: () => new Promise(r => { waiting.push(r); if (waiting.length >= n) release(); }) };
  };
  db.handle = async (st, dev) => {
    if (db.offline.has(dev)) return { data: null, error: { message: 'TypeError: Failed to fetch' } };
    if (st.table !== 'live_workouts') {
      if (st.op !== 'select') db.other.push(st.table + ':' + st.op);
      return { data: null, error: { message: 'stub: table not served' } };
    }
    const f = Object.fromEntries(st.filters);
    if (st.op === 'select') {
      if (db.gate) await db.gate.wait();
      const r = db.row && (!('code' in f) || db.row.code === f.code) ? clone(db.row) : null;
      return { data: st.single ? r : (r ? [r] : []), error: null };
    }
    if (st.op === 'insert') {
      if (db.row) { db.ops.push(['dup', dev]); return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }; }
      db.row = clone(st.row); db.ops.push(['insert', dev]); return { data: null, error: null };
    }
    if (st.op === 'update') {
      if (!db.row || Object.entries(f).some(([k, v]) => db.row[k] !== v)) { db.casMiss++; db.ops.push(['miss', dev]); return { data: [], error: null }; }
      Object.assign(db.row, clone(st.row)); db.ops.push(['update', dev]);
      return { data: [{ rev: db.row.rev }], error: null };
    }
    return { data: null, error: { message: 'stub: op ' + st.op } };
  };
  return db;
}

// A booted app page signed in as @tester, with the stub client installed. `name` is its device id.
async function device(db, name) {
  const d = await phone({ seed: SEED });
  await d.page.exposeFunction('__lw', s => db.handle(JSON.parse(s), name));
  await d.page.evaluate(name => {
    const call = st => window.__lw(JSON.stringify(st));
    function Q(table) { this.st = { table, op: 'select', filters: [], single: false }; }
    Q.prototype.select = function () { return this; };
    Q.prototype.update = function (p) { this.st.op = 'update'; this.st.row = p; return this; };
    Q.prototype.insert = function (r) { this.st.op = 'insert'; this.st.row = r; return this; };
    Q.prototype.upsert = function (r) { this.st.op = 'upsert'; this.st.row = r; return this; };
    Q.prototype.delete = function () { this.st.op = 'delete'; return this; };
    Q.prototype.eq = function (k, v) { this.st.filters.push([k, v]); return this; };
    Q.prototype.maybeSingle = function () { this.st.single = true; return this; };
    ['in', 'order', 'limit', 'or', 'neq', 'gte', 'lte', 'gt', 'lt', 'ilike', 'not', 'range', 'single', 'is'].forEach(m => { Q.prototype[m] = function () { return this; }; });
    Q.prototype.then = function (res, rej) { return call(this.st).then(res, rej); };
    const no = () => Promise.resolve({ data: null, error: { message: 'stub' } });
    const chan = { on() { return chan; }, subscribe() { return chan; }, unsubscribe() {} };
    SUPA = { from: t => new Q(t), channel: () => chan, removeChannel() {}, rpc: no, functions: { invoke: no },
      storage: { from: () => ({ upload: no, remove: no, getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange() {}, signOut: () => Promise.resolve({}) } };
    _authUid = 'uid-test';
    LIVE_POLL_MS = 1e9;   // the tests drive every sync themselves
    localStorage.setItem('jacked_deviceId', name);
  }, name);
  return { ...d, name };
}
const ev = (d, fn, arg) => d.page.evaluate(fn, arg);
// Start a routine workout on A with sets [w,reps,done]... and publish it.
async function startShared(db, A, sets) {
  await ev(A, sets => {
    startRW('r1');
    const ex = aw.exercises[0];
    ex.sets = sets.map(([weight, reps, done]) => ({ weight, reps, done }));
    renderWS();
  }, sets);
  await ev(A, () => { clearTimeout(_livePushT); return liveSync(); });
  return db.row.session_id;
}
const snap = d => ev(d, () => ({ aw: aw ? JSON.parse(JSON.stringify(aw)) : null, hist: gH(), prs: gPR(), stats: { ..._liveStats } }));

// 1. Every change while a workout is open writes live_workouts, debounced, separate from the backup.
export async function liveWrites() {
  const db = makeDb(); const A = await device(db, 'phone-A');
  await ev(A, () => { startRW('r1'); addSet(0); uSet(0, 0, 'weight', '100'); uSet(0, 0, 'reps', '5'); uSet(0, 1, 'weight', '90'); });
  check('live: nothing written before the debounce elapses', db.row === null && db.ops.length === 0, JSON.stringify(db.ops));
  await wait(1900);
  const id = await ev(A, () => aw.id), r = db.row;
  const sets = r ? r.doc.exercises[0].sets : [];
  check('live: one debounced write for a burst of edits, row = this session', db.ops.length === 1 && db.ops[0][0] === 'insert' && r.session_id === id && r.status === 'active' && r.rev === 1 && r.updated_by === 'phone-A', JSON.stringify(db.ops));
  check('live: doc carries the typed sets', sets.length === 2 && sets[0].weight === 100 && sets[0].reps === 5 && sets[1].weight === 90, JSON.stringify(sets));
  check('live: stable ids + change stamps on every exercise and set', r.doc.exercises.every(e => e.lid && e.u > 0 && e.d === 'phone-A' && e.sets.every(s => s.sid && s.u > 0 && s.d === 'phone-A')) && r.doc.mu && r.doc.mu.order, JSON.stringify(r.doc.exercises[0]));
  await ev(A, () => { aw.exercises[0].imgUrl = 'data:image/png;base64,AAAA'; uSet(0, 1, 'reps', '8'); });
  await wait(1900);
  check('live: next edit is a version-checked update (rev 2)', db.row.rev === 2 && db.ops.length === 2 && db.ops[1][0] === 'update' && db.row.doc.exercises[0].sets[1].reps === 8, JSON.stringify(db.ops));
  check('live: a custom exercise photo (data: URL) never goes on the wire', !JSON.stringify(db.row.doc).includes('data:image'));
  check('live: the live path never wrote the backup blob', !db.other.some(o => o.startsWith('profile_backups')), db.other.join(','));
  check('live writes: no console errors', A.errors.length === 0, A.errors.join(' | '));
  await A.ctx.close();
}

// 2. Two devices edit different sets at the same moment: the CAS loser re-reads + re-merges, both survive.
export async function liveConcurrent() {
  const db = makeDb(); const A = await device(db, 'phone-A'), B = await device(db, 'wear-B');
  const sid = await startShared(db, A, [[60, 5, false], [60, 5, false]]);
  const res = await ev(B, () => liveResumeRemote());
  check('live: second device picks up the live session', res === 'resumed' && (await ev(B, () => aw.id)) === sid, res);
  await ev(A, () => { uSet(0, 0, 'weight', '100'); clearTimeout(_livePushT); });
  await ev(B, () => { uSet(0, 1, 'reps', '12'); clearTimeout(_livePushT); });
  const miss0 = db.casMiss;
  db.barrier(2);
  await Promise.all([ev(A, () => liveSync()), ev(B, () => liveSync())]);
  const s = db.row.doc.exercises[0].sets;
  check('live: concurrent writers raced on the same rev (one CAS missed)', db.casMiss - miss0 >= 1, `casMiss ${db.casMiss - miss0}, ops ${JSON.stringify(db.ops)}`);
  check('live: both concurrent edits survive on the server', s.length === 2 && s[0].weight === 100 && s[1].reps === 12, JSON.stringify(s));
  await ev(A, () => liveSync()); await ev(B, () => liveSync());
  const [a, b] = [await snap(A), await snap(B)];
  const ok = x => x.aw.exercises[0].sets[0].weight === 100 && x.aw.exercises[0].sets[1].reps === 12;
  check('live: both devices converge on both edits', ok(a) && ok(b), JSON.stringify([a.aw.exercises[0].sets, b.aw.exercises[0].sets]));
  // Delete = tombstone: A removes set 2 while B (stale) edits set 1; set 2 must not come back.
  await ev(A, () => { removeSet(0); clearTimeout(_livePushT); return liveSync(); });
  await ev(B, () => { uSet(0, 0, 'reps', '7'); clearTimeout(_livePushT); return liveSync(); });
  await ev(A, () => liveSync());
  const [a2, b2] = [await snap(A), await snap(B)];
  const deadSid = a.aw.exercises[0].sets[1].sid;
  check('live: a deleted set stays deleted (tombstone beats the stale copy)', db.row.doc.exercises[0].sets.length === 1 && !!db.row.doc.tomb[deadSid] && b2.aw.exercises[0].sets.length === 1, JSON.stringify(db.row.doc.exercises[0].sets));
  check('live: the edit made alongside the delete survives', a2.aw.exercises[0].sets[0].reps === 7 && db.row.doc.exercises[0].sets[0].weight === 100, JSON.stringify(a2.aw.exercises[0].sets));
  // An exercise added on one device appears on the other.
  await ev(B, () => { addExToWorkout('cex2'); clearTimeout(_livePushT); return liveSync(); });
  await ev(A, () => liveSync());
  check('live: an exercise added on one device shows on the other', (await ev(A, () => aw.exercises.map(e => e.exId).join(','))) === 'cex1,cex2');
  check('live concurrent: no console errors', A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
  await A.ctx.close(); await B.ctx.close();
}

// 3 + 4. Finish on both devices at once (one manual, one auto): one CAS winner, one commit. A repeat
// Finish of the same workout commits nothing more.
export async function liveFinishOnce() {
  const db = makeDb(); const A = await device(db, 'phone-A'), B = await device(db, 'wear-B');
  const sid = await startShared(db, A, [[100, 5, true]]);
  await ev(B, () => liveResumeRemote());
  db.barrier(2);
  await Promise.all([ev(A, () => { _finishWContinue(false); }), ev(B, () => { _finishWContinue(true); })]);
  await wait(1500);
  const [a, b] = [await snap(A), await snap(B)];
  const n = x => x.hist.filter(w => w.id === sid).length;
  check('live finish: manual + auto finish on two devices -> exactly one history entry', n(a) + n(b) === 1, `A ${n(a)} B ${n(b)}`);
  check('live finish: PRs committed exactly once (one device)', a.stats.commits + b.stats.commits === 1 && (a.prs.cex1 ? 1 : 0) + (b.prs.cex1 ? 1 : 0) === 1, JSON.stringify([a.stats, b.stats]));
  check('live finish: row marked finished, both devices closed the workout', db.row.status === 'finished' && !a.aw && !b.aw, db.row.status);
  const W = n(a) ? A : B, L = W === A ? B : A, w0 = W === A ? a : b;
  check('live finish: the history entry id is the session id minted at Start', w0.hist.some(x => x.id === sid && x.lrev >= 1));
  // A repeat Finish of the same workout on the winner (e.g. a stale copy resumed): no second commit.
  await ev(W, doc => { aw = liveFromWire(doc, null); awStart = aw.startedAt; _finLock = null; _finishWContinue(false); }, db.row.doc);
  await wait(400);
  const w1 = await snap(W);
  check('live finish: second Finish on the same device commits nothing', w1.hist.filter(x => x.id === sid).length === 1 && w1.stats.commits === w0.stats.commits && JSON.stringify(w1.prs) === JSON.stringify(w0.prs) && w1.stats.dupFinish === 1, JSON.stringify(w1.stats));
  // ...and on the other device: the CAS finds it finished with nothing new -> no commit there either.
  const l0 = await snap(L);
  await ev(L, doc => { aw = liveFromWire(doc, null); awStart = aw.startedAt; _finLock = null; _finishWContinue(false); }, db.row.doc);
  await wait(800);
  const l1 = await snap(L);
  check('live finish: duplicate Finish from the other device commits nothing', l1.stats.commits === l0.stats.commits && l1.hist.filter(x => x.id === sid).length === 0 && !l1.aw && !l1.prs.cex1, JSON.stringify(l1.stats));
  check('live finish: no console errors', A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
  await A.ctx.close(); await B.ctx.close();
}

// 5. Same device: manual Finish (confirm open) and the 30/70-min auto-finish fire together -> one commit.
export async function liveFinishLock() {
  const db = makeDb(); const A = await device(db, 'phone-A');
  // 'same-tick': the confirmed manual Finish and the auto timer fire in one JS tick, before the
  // server answers. '+net-down': the network fails too, so no server CAS can stop the second
  // trigger -- only the local finish lock does.
  for (const order of ['auto-then-confirm', 'confirm-then-auto', 'same-tick', 'same-tick+net-down']) {
    await startShared(db, A, [[100, 5, true]]);
    if (order.endsWith('net-down')) db.offline.add('phone-A');
    const c0 = (await snap(A)).stats.commits, id = await ev(A, () => aw.id);
    if (order === 'auto-then-confirm') {
      await ev(A, () => { finishW(); });             // manual: confirm dialog open
      await ev(A, () => { autoFinishStale(); });     // auto fires underneath it
      await wait(600);
      await ev(A, () => _cfDone(true));              // then he taps OK
    } else if (order.startsWith('same-tick')) {
      await ev(A, () => { _finishWContinue(false); autoFinishStale(); });
    } else {
      await ev(A, () => { finishW(); _cfDone(true); });
      await ev(A, () => { autoFinishStale(); });     // auto fires while the finish CAS is in flight
    }
    await wait(1200);
    db.offline.delete('phone-A');
    const s = await snap(A);
    check(`live lock (${order}): one commit, one history entry`, s.stats.commits - c0 === 1 && s.hist.filter(w => w.id === id).length === 1 && !s.aw, JSON.stringify(s.stats));
    db.row = null;
  }
  // Offline (no client at all): the same lock holds without the server.
  await ev(A, () => { SUPA = null; });
  await ev(A, () => { startRW('r1'); aw.exercises[0].sets = [{ weight: 110, reps: 3, done: true }]; renderWS(); });
  const c0 = (await snap(A)).stats.commits, id = await ev(A, () => aw.id);
  await ev(A, () => { finishW(); autoFinishStale(); _cfDone(true); });
  await wait(500);
  const s = await snap(A);
  check('live lock (offline): manual + auto -> one commit', s.stats.commits - c0 === 1 && s.hist.filter(w => w.id === id).length === 1, JSON.stringify(s.stats));
  check('live lock: no console errors', A.errors.length === 0, A.errors.join(' | '));
  await A.ctx.close();
}

// 6. Offline sets that arrive after the other device finished: merged in, totals + PRs recomputed.
export async function liveLateSets() {
  const db = makeDb(); const A = await device(db, 'phone-A'), B = await device(db, 'wear-B');
  const sid = await startShared(db, A, [[100, 5, true]]);
  await ev(B, () => liveResumeRemote());
  db.offline.add('wear-B');
  await ev(B, () => { addSet(0); const s = aw.exercises[0].sets[1]; s.weight = 120; s.reps = 5; s.done = true; renderWS(); clearTimeout(_livePushT); return liveSync(); });
  await ev(A, () => { _finishWContinue(false); });
  await wait(800);
  const a0 = await snap(A);
  check('live late: A finished alone with the one set it had', a0.hist.find(w => w.id === sid)?.sets === 1 && Math.round(a0.prs.cex1?.weight) === 100, JSON.stringify(a0.prs));
  db.offline.delete('wear-B');
  const r = await ev(B, () => liveSync());
  const b = await snap(B);
  check('live late: reconnecting device merges its late set into the finished row', r === 'late-merged' && db.row.status === 'finished' && db.row.doc.exercises[0].sets.length === 2 && !b.aw, `${r} ${JSON.stringify(db.row.doc.exercises[0].sets.map(s => s.weight))}`);
  check('live late: the late device holds the full workout, not a second one', b.hist.filter(w => w.id === sid).length === 1 && b.hist.length === 1 && b.hist[0].sets === 2, JSON.stringify(b.hist.map(w => [w.id, w.sets])));
  await ev(A, () => liveSync());
  const a1 = await snap(A), e = a1.hist.find(w => w.id === sid);
  check('live late: finisher recomputes its entry -- sets + volume', a1.hist.length === 1 && e.sets === 2 && e.totalVolume === 1100 && e.exercises[0].sets.length === 2, JSON.stringify([e.sets, e.totalVolume]));
  check('live late: finisher recomputes PRs from the late set (not a silent drop)', Math.round(a1.prs.cex1.weight) === 120 && e.prCount === 1 && Math.round(e.prSets[0].weight) === 120 && e.prSets[0].si === 1 && e.lrev === db.row.rev, JSON.stringify([a1.prs.cex1, e.prSets, e.lrev]));
  await ev(A, () => liveSync());
  check('live late: re-reading the same finished row does not recompute again', (await snap(A)).stats.recomputes === a1.stats.recomputes);
  const m = await ev(A, () => {
    const hi = mergeBackup({ jk_hist: [{ id: 'x', lrev: 3, sets: 2 }] }, { jk_hist: [{ id: 'x', lrev: 2, sets: 1 }] }).jk_hist[0].sets;
    const lo = mergeBackup({ jk_hist: [{ id: 'x', lrev: 1, sets: 2 }] }, { jk_hist: [{ id: 'x', lrev: 2, sets: 1 }] }).jk_hist[0].sets;
    const none = mergeBackup({ jk_hist: [{ id: 'x', sets: 2 }] }, { jk_hist: [{ id: 'x', sets: 1 }] }).jk_hist[0].sets;
    return [hi, lo, none];
  });
  check('live late: backup merge keeps the higher-lrev entry, else local wins as before', m.join() === '2,1,1', m.join());
  check('live late: no console errors', A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
  await A.ctx.close(); await B.ctx.close();
}

// Resume prompt, offline finish settling later, discard on both, and folding a second session.
export async function liveLifecycle() {
  const db = makeDb(); const A = await device(db, 'phone-A'), B = await device(db, 'wear-B');
  // Resume: a device with no workout open is offered the live one.
  const sid = await startShared(db, A, [[80, 8, true]]);
  const p = ev(B, () => liveSync());
  await wait(300);
  const msg = await ev(B, () => document.getElementById('cfMsg').textContent);
  await ev(B, () => _cfDone(true));
  await p; await wait(200);
  check('live resume: idle device asks to resume the other device\'s workout', /Resume the workout from your other phone/.test(msg) && (await ev(B, () => aw && aw.id)) === sid, msg);
  // Finish offline on A: commits locally, settles the row once back online; B closes without committing.
  db.offline.add('phone-A');
  await ev(A, () => { _finishWContinue(false); });
  await wait(500);
  check('live offline finish: commits locally and queues the server update', (await ev(A, () => gH().length + ':' + liveQ().length)) === '1:1' && db.row.status === 'active');
  db.offline.delete('phone-A');
  await ev(A, () => liveFlushFinishQ());
  await ev(B, () => liveSync());
  const b = await snap(B);
  check('live offline finish: row settled as finished, other device closed with no commit', db.row.status === 'finished' && (await ev(A, () => liveQ().length)) === 0 && !b.aw && b.stats.commits === 0, JSON.stringify(b.stats));
  // Discard on one device ends it on the other.
  await ev(B, () => { cm('fsModal'); });
  const sid2 = await startShared(db, A, [[50, 5, false]]);
  await ev(B, () => liveResumeRemote());
  await ev(A, () => { cancelW(); }); await ev(A, () => _cfDone(true));
  await wait(400);
  await ev(B, () => liveSync());
  check('live discard: Discard on one device ends it on both, nothing saved', db.row.status === 'discarded' && db.row.session_id === sid2 && !(await ev(B, () => !!aw)) && (await ev(B, () => gH().length)) === 0);
  // Two sessions: B starts its own while A's is live -> asked, then folded into A's (no 2nd workout).
  const sid3 = await startShared(db, A, [[100, 5, true]]);
  await ev(B, () => { startEmpty(); addExToWorkout('cex2'); aw.exercises[0].sets[0] = { weight: 70, reps: 10, done: true }; renderWS(); clearTimeout(_livePushT); });
  const q = ev(B, () => liveSync());
  await wait(300);
  const msg2 = await ev(B, () => document.getElementById('cfMsg').textContent);
  await ev(B, () => _cfDone(true));
  await q; await ev(B, () => liveSync()); await ev(A, () => liveSync());
  const a = await snap(A);
  check('live fold: a second session is offered as "add to it" and merges into the live one', /already in progress on your other phone/.test(msg2) && (await ev(B, () => aw.id)) === sid3 && a.aw.exercises.map(e => e.exId).join() === 'cex1,cex2' && a.aw.exercises[1].sets[0].weight === 70, msg2 + ' ' + JSON.stringify(a.aw.exercises.map(e => e.exId)));
  check('live lifecycle: no console errors', A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
  await A.ctx.close(); await B.ctx.close();
}

export const LIVE_SUITES = [liveWrites, liveConcurrent, liveFinishOnce, liveFinishLock, liveLateSets, liveLifecycle];
