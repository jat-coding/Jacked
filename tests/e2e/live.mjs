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
  { id: 'cex3', name: 'Leg Press', muscle: 'legs', equip: 'machine', tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true },
  { id: 'cex4', name: 'Incline Curl', muscle: 'biceps', equip: 'dumbbell', tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true },
];
const SEED = { cex: CEX, routines: [
  { id: 'r1', name: 'Push', desc: '', exercises: ['cex1'] },
  { id: 'r2', name: 'Full', desc: '', exercises: ['cex1', 'cex2'] },
] };
const wait = ms => new Promise(r => setTimeout(r, ms));
const LIVE_FINISH_WAIT = 7000;   // past the app's 4 s finish bounds, short of its 10 s request timeout: Finish must not need the stuck request to die first
const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

function makeDb() {
  const db = { row: null, ops: [], casMiss: 0, offline: new Set(), other: [], gate: null, hang: 0 };
  // Hold the next n reads until all n have arrived, so two devices read the same rev and race.
  db.barrier = n => {
    const waiting = [];
    const release = () => { db.gate = null; waiting.splice(0).forEach(f => f()); };
    setTimeout(release, 3000);   // never hang the suite
    db.gate = { wait: () => new Promise(r => { waiting.push(r); if (waiting.length >= n) release(); }) };
  };
  db.handle = async (st, dev) => {
    if (db.offline.has(dev)) return { data: null, error: { message: 'TypeError: Failed to fetch' } };
    if (db.hang > 0 && st.table === 'live_workouts') { db.hang--; return new Promise(() => {}); }   // a request that never answers (half-open socket)
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
// Live (not deleted) entries of a wire-format list: deletes stay inline as {sid|lid, del:true, u, ud}.
const live = a => (a || []).filter(x => !x.del);
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
  check('live: stable ids + change stamps on every exercise and set', r.doc.exercises.every(e => e.lid && e.u > 0 && e.ud === 'phone-A' && e.sets.every(s => s.sid && s.u > 0 && s.ud === 'phone-A')) && r.doc.stamps && r.doc.stamps.order && r.doc.stamps.name && r.doc.startedBy === 'phone' && r.doc.v === 1 && !('tomb' in r.doc), JSON.stringify(r.doc.exercises[0]));
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
  const s = live(db.row.doc.exercises[0].sets);
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
  const tombs = db.row.doc.exercises[0].sets.filter(x => x.del);
  check('live: a deleted set stays deleted (tombstone beats the stale copy)', live(db.row.doc.exercises[0].sets).length === 1 && b2.aw.exercises[0].sets.length === 1, JSON.stringify(db.row.doc.exercises[0].sets));
  check('live: the delete is an inline tombstone {sid, del:true, u, ud} on the wire, hidden on screen', tombs.some(x => x.sid === deadSid && x.u > 0 && x.ud === 'phone-A' && Object.keys(x).length === 4) && !b2.aw.exercises[0].sets.some(x => x.del || x.sid === deadSid), JSON.stringify(tombs));
  check('live: the edit made alongside the delete survives', a2.aw.exercises[0].sets[0].reps === 7 && live(db.row.doc.exercises[0].sets)[0].weight === 100, JSON.stringify(a2.aw.exercises[0].sets));
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
  const he = w0.hist.find(x => x.id === sid);
  check('live finish: the history entry id is the session id minted at Start', he && he.lrev >= 1);
  check('live finish: history keeps lid/sid (watch late-set matching), drops stamps and live state', he.exercises[0].lid && he.exercises[0].sets[0].sid && !('u' in he.exercises[0].sets[0]) && !('ud' in he.exercises[0]) && !('stamps' in he) && !('finishedBy' in he) && !('tomb' in he), JSON.stringify(he.exercises[0]));
  check('live finish: final doc carries the winner\'s finish nonce', /^(phone-A|wear-B):[a-z0-9]+$/.test(db.row.doc.finishedBy || ''), db.row.doc.finishedBy);
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

// 5. Same device: manual Finish (confirm open) and the 30/90-min auto-finish fire together -> one commit.
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
  check('live late: reconnecting device merges its late set into the finished row', r === 'late-merged' && db.row.status === 'finished' && live(db.row.doc.exercises[0].sets).length === 2 && !b.aw, `${r} ${JSON.stringify(live(db.row.doc.exercises[0].sets).map(s => s.weight))}`);
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

// A winning Finish whose reply is lost still saves (finish nonce); auto-finish on a shared workout
// re-reads the row first and never locks in the watch's pre-filled rows (Phil's review, cd9895b).
export async function liveFinishEdges() {
  const db = makeDb(); const A = await device(db, 'phone-A'), B = await device(db, 'wear-B');
  const sid = await startShared(db, A, [[100, 5, true]]);
  // Reply lost: the CAS lands on the server but A is told nothing changed, so A re-reads.
  let dropped = false;
  const h0 = db.handle;
  db.handle = async (st, dev) => { const r = await h0(st, dev); if (!dropped && st.op === 'update' && st.row.status === 'finished') { dropped = true; return { data: [], error: null }; } return r; };
  await ev(A, () => { _finishWContinue(false); });
  await wait(1000);
  db.handle = h0;
  const a = await snap(A);
  check('live nonce: a winning Finish whose reply was lost is recognised and saved once', dropped && db.row.status === 'finished' && a.hist.filter(w => w.id === sid).length === 1 && a.stats.commits === 1 && !a.aw, JSON.stringify(a.stats));
  // Auto-finish, shared: A typed set 1; the watch pre-filled set 2 (not done). Only A's typed set locks in.
  db.row = null;
  const sid2 = await startShared(db, A, [[90, 5, false]]);
  await ev(B, () => liveResumeRemote());
  await ev(B, () => { addSet(0); const s = aw.exercises[0].sets[1]; s.weight = 95; s.reps = 5; renderWS(); clearTimeout(_livePushT); return liveSync(); });
  await ev(A, () => liveSync());
  await ev(A, () => { awTouch = Date.now() - 31 * 60000; autoFinishStale(); });
  await wait(1500);
  const a2 = await snap(A), e = a2.hist.find(w => w.id === sid2);
  check('live auto-finish (shared): only the set typed on this device is locked in, not the watch\'s pre-filled row', e && e.sets === 1 && e.exercises[0].sets.length === 2 && e.exercises[0].sets[0].done === true && e.exercises[0].sets[1].done === false && db.row.status === 'finished', JSON.stringify(e && e.exercises[0].sets.map(s => [s.weight, s.done])));
  // Auto-finish re-reads first: the watch logged a set the phone had not pulled -> not idle, no finish.
  const bClose = await ev(B, () => liveSync());   // the watch sees that finish and closes its copy
  await ev(B, () => { cm('fsModal'); });
  db.row = null;
  const sid3 = await startShared(db, A, [[0, 0, false]]);
  await ev(B, () => liveResumeRemote());
  await ev(B, () => { const s = aw.exercises[0].sets[0]; s.weight = 70; s.reps = 8; s.done = true; renderWS(); clearTimeout(_livePushT); return liveSync(); });
  await ev(A, () => { awTouch = Date.now() - 31 * 60000; autoFinishStale(); });
  await wait(1200);
  const a3 = await snap(A);
  check('live auto-finish (shared): re-reads the row first; the watch\'s fresh set keeps the workout open (no blank discard)', a3.aw && a3.aw.id === sid3 && a3.aw.exercises[0].sets[0].done === true && db.row.status === 'active' && !a3.hist.some(w => w.id === sid3), JSON.stringify({ aw: !!a3.aw, st: db.row.status }));
  check('live auto-finish (shared): the other device closes on the finished row', bClose === 'closed', bClose);
  check('live finish edges: no console errors', A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
  await A.ctx.close(); await B.ctx.close();
}

// A live-claim that rejects outright (not the ordinary offline/CAS-contention paths
// liveClaimFinish already recovers from itself) must still finish the workout locally rather
// than strand the user on the active-workout screen (2026-10-12 bug). Monkeypatches
// liveClaimFinish directly so the failure reaches _finishWContinue's own promise chain,
// which previously had no .catch() at all.
export async function liveFinishClaimFails() {
  const db = makeDb(); const A = await device(db, 'phone-A');
  // Reject outright.
  const sid = await startShared(db, A, [[100, 5, true]]);
  await ev(A, () => { window.liveClaimFinish = () => Promise.reject(new Error('stub claim failure')); });
  await ev(A, () => { _finishWContinue(false); });
  await wait(800);
  const a = await snap(A);
  check('live finish claim rejects: the workout still finishes locally instead of hanging', !a.aw && a.hist.filter(w => w.id === sid).length === 1 && a.stats.commits === 1, JSON.stringify({ aw: !!a.aw, hist: a.hist.map(w => w.id), stats: a.stats }));
  check('live finish claim rejects: the failed claim is queued so the server catches up later', (await ev(A, () => liveQ().length)) === 1);
  check('live finish claim rejects: home is shown, not left on the active-workout screen', await ev(A, () => document.getElementById('page-home').classList.contains('active')));
  // A second Finish attempt (or just starting a fresh workout) is not itself stuck behind the old lock.
  await ev(A, () => { startEmpty(); addExToWorkout('cex1'); });
  const resumed = await ev(A, () => aw && aw.id);
  check('live finish claim rejects: a new workout can be started right after (lock not stuck)', !!resumed && resumed !== sid, String(resumed));
  await ev(A, () => { cancelW(); }); await ev(A, () => _cfDone(true));

  // Resolves to nothing usable (no error, just a falsy/empty result) -- same stuck risk, different trigger.
  db.row = null;
  const sid2 = await startShared(db, A, [[90, 5, true]]);
  await ev(A, () => { window.liveClaimFinish = () => Promise.resolve(null); });
  await ev(A, () => { _finishWContinue(false); });
  await wait(800);
  const b = await snap(A);
  check('live finish claim returns falsy: the workout still finishes locally instead of hanging', !b.aw && b.hist.filter(w => w.id === sid2).length === 1, JSON.stringify({ aw: !!b.aw, hist: b.hist.map(w => w.id) }));
  check('live finish claim fails: no console errors', A.errors.length === 0, A.errors.join(' | '));
  await A.ctx.close();
}

// Two devices switch DIFFERENT exercise slots in the same shared routine workout at the same
// moment. mergeLive() used to treat aw.swaps as one whole-field value (same as name/notes) --
// a stamp-timestamp last-write-wins that silently drops whichever side's switch lost the race,
// instead of unioning two genuinely different keys (2026-10-12 adversarial find). The visible
// consequence: the Finish routine-update prompt describes the lost switch as an unrelated
// add+remove ("added Leg Press; removed Barbell Bench Press") instead of "switched Barbell
// Bench Press -> Leg Press", even though the final exercise list itself still ends up correct.
export async function liveConcurrentSwaps() {
  const db = makeDb(); const A = await device(db, 'phone-A'), B = await device(db, 'wear-B');
  await ev(A, () => { startRW('r2'); clearTimeout(_livePushT); return liveSync(); });
  await ev(B, () => liveResumeRemote());
  await ev(A, () => { replaceExAt(0, 'cex3'); clearTimeout(_livePushT); });
  await ev(B, () => { replaceExAt(1, 'cex4'); clearTimeout(_livePushT); });
  db.barrier(2);
  await Promise.all([ev(A, () => liveSync()), ev(B, () => liveSync())]);
  await ev(A, () => liveSync()); await ev(B, () => liveSync());
  const [a, b] = [await snap(A), await snap(B)];
  check('live swaps race: both concurrent switches land on the server, not just the last writer', !!db.row.doc.swaps && db.row.doc.swaps.cex1 === 'cex3' && db.row.doc.swaps.cex2 === 'cex4', JSON.stringify(db.row.doc.swaps));
  const fullSwaps = s => s && s.cex1 === 'cex3' && s.cex2 === 'cex4' && Object.keys(s).length === 2;
  check('live swaps race: both devices converge on the full swap map', fullSwaps(a.aw.swaps) && fullSwaps(b.aw.swaps), JSON.stringify([a.aw.swaps, b.aw.swaps]));
  // Finish on A: the routine-update prompt must credit both as switches, not a spurious add+remove.
  await ev(A, () => { aw.exercises[0].sets[0] = { weight: 50, reps: 5, done: true }; saveAW(); });
  const p = ev(A, () => maybeUpdateRoutine());
  await wait(200);
  const msg = await ev(A, () => document.getElementById('cfMsg').textContent);
  await ev(A, () => _cfDone(true));
  await p;
  check('live swaps race: the routine-update prompt credits both switches, not a spurious add+remove', /Barbell Bench Press → Leg Press/.test(msg) && /Barbell Row → Incline Curl/.test(msg) && !/added/.test(msg) && !/removed/.test(msg), msg);
  check('live swaps race: no console errors', A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
  await A.ctx.close(); await B.ctx.close();
}

// A live sync whose request never answers (half-open socket on flaky cell signal: fetch has no
// timeout of its own) must not hold Finish hostage. _finishWContinue waited on the in-flight
// sync (_liveBusy) with no bound before even starting the claim -- which has its own 4 s
// timeout -- so Finish hung on the active-workout screen with _finLock set, and every later
// tap of Finish was swallowed by that lock (2026-10-12 adversarial find). Same for auto-finish:
// it cleared the workout clock, then waited on a sync that never came back, so it never fired.
export async function liveFinishHungSync() {
  const db = makeDb(); const A = await device(db, 'phone-A');
  const sid = await startShared(db, A, [[100, 5, true]]);
  db.hang = 1;
  await ev(A, () => { liveSync(); });   // the read inside this sync never answers
  await wait(100);
  await ev(A, () => { _finishWContinue(false); });
  await wait(LIVE_FINISH_WAIT);
  const a = await snap(A);
  check('live hung sync: Finish still completes (saved once, off the workout screen) instead of hanging', !a.aw && a.hist.filter(w => w.id === sid).length === 1 && a.stats.commits === 1 && (await ev(A, () => document.getElementById('page-home').classList.contains('active'))), JSON.stringify({ aw: !!a.aw, hist: a.hist.map(w => w.id), stats: a.stats }));
  check('live hung sync: the finish reached the server (or is queued to)', db.row.status === 'finished' || (await ev(A, () => liveQ().length)) === 1, db.row.status);
  // Auto-finish behind a hung sync: same trap.
  await ev(A, () => { _liveBusy = null; });   // a reload would also drop the hung promise; isolate the second case
  db.row = null;
  const sid2 = await startShared(db, A, [[80, 5, true]]);
  db.hang = 1;
  await ev(A, () => { awTouch = Date.now() - 31 * 60000; autoFinishStale(); });
  await wait(LIVE_FINISH_WAIT);
  const b = await snap(A);
  check('live hung sync: auto-finish still fires when its re-read never answers', !b.aw && b.hist.filter(w => w.id === sid2).length === 1, JSON.stringify({ aw: !!b.aw, hist: b.hist.map(w => w.id) }));
  // And live sync itself recovers: a stuck request times out instead of wedging _liveBusy for the session.
  await ev(A, () => { startEmpty(); addExToWorkout('cex1'); clearTimeout(_livePushT); });
  db.hang = 1;
  const r = await Promise.race([ev(A, () => liveSync()), wait(15000).then(() => 'still hung after 15s')]);
  const r2 = await Promise.race([ev(A, () => liveSync()), wait(5000).then(() => 'still hung')]);
  check('live hung sync: a stuck request times out and the next sync goes through', r === 'error' && (r2 === 'written' || r2 === 'replaced' || r2 === 'inserted'), r + ' / ' + r2);
  check('live hung sync: no console errors', A.errors.length === 0, A.errors.join(' | '));
  await A.ctx.close();
}

// Adversarial pass 2 (2026-10-13). Start-over-open: starting another workout while a shared one is open used to
// overwrite it on the phone with no question and leave the old session live on the watch. "Discard & start" now
// discards it everywhere, exactly like Cancel Workout, and the new session takes the row.
export async function liveStartOverOpen() {
  const db = makeDb(); const A = await device(db, 'phone-A'), B = await device(db, 'wear-B');
  const sid = await startShared(db, A, [[100, 5, true]]);
  await ev(B, () => liveResumeRemote());
  await ev(A, () => { window._cfLog = []; window.showConfirm = m => { _cfLog.push(m); return Promise.resolve(false); }; startRW('r2'); });
  await wait(200);
  const kept = await ev(A, () => ({ id: aw.id, asked: _cfLog.slice() }));
  check('live start-over-open: asks first; "Keep it" leaves the shared session open and live', kept.id === sid && kept.asked.length === 1 && db.row.session_id === sid && db.row.status === 'active', JSON.stringify(kept));
  await ev(A, () => { window.showConfirm = () => Promise.resolve(true); startRW('r2'); });
  await wait(1200);
  const a = await snap(A);
  check('live start-over-open: "Discard & start" ends the old session on the row (discarded), nothing saved', a.aw && a.aw.id !== sid && a.aw.name === 'Full' && a.hist.length === 0 && (db.row.session_id !== sid || db.row.status === 'discarded'), JSON.stringify({ row: db.row && [db.row.session_id === sid, db.row.status] }));
  await ev(A, () => { clearTimeout(_livePushT); return liveSync(); });
  const r = await ev(B, () => liveSync());
  const b = await snap(B);
  check('live start-over-open: the watch closes the old session instead of keeping it alive', !b.aw && b.hist.length === 0, JSON.stringify({ r, aw: b.aw && b.aw.id }));
  check('live start-over-open: the new session owns the row', db.row.session_id === a.aw.id && db.row.status === 'active', JSON.stringify([db.row.session_id, db.row.status]));
  check('live start-over-open: no console errors', A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
  await A.ctx.close(); await B.ctx.close();
}
// Adversarial pass 2: Finish on a full phone after this device already won the live finish claim. The workout stays
// open here (nothing stored), and the retry once space is freed commits it locally exactly once, without claiming again.
export async function liveFinishStorageFull() {
  const db = makeDb(); const A = await device(db, 'phone-A');
  const sid = await startShared(db, A, [[100, 5, true]]);
  await ev(A, () => { let c = 'x'.repeat(1 << 20), i = 0; while (c.length > 16) { try { localStorage.setItem('fill' + i, c); i++; } catch (e) { c = c.slice(c.length / 2); } } });
  await ev(A, () => { _finishWContinue(false); });
  await wait(1500);
  const a = await snap(A);
  const ops0 = db.ops.length;
  check('live storage full: claim won on the server, but nothing stored here -> workout still open, not in history', db.row.status === 'finished' && a.aw && a.aw.id === sid && a.hist.length === 0 && a.stats.commits === 1, JSON.stringify({ st: db.row.status, aw: !!a.aw, h: a.hist.length }));
  // A live poll in between must not take the (server-finished) row as "ended elsewhere" and close the
  // workout here: this device won the claim, so nobody else will ever save it.
  const r = await ev(A, () => liveSync());
  check('live storage full: a live sync before the retry leaves the unsaved workout open', await ev(A, () => !!aw), String(r));
  // Same after an app restart (solo flag gone, storage still full): resuming meets its own finished row and
  // tries to save it from there -- that write fails too, and the workout must still stay open.
  const r2 = await ev(A, () => { _liveSolo = null; return liveSync(); });
  check('live storage full: after a restart, the resumed copy meeting its own finished row stays open when it cannot save', r2 === 'unsaved' && await ev(A, () => !!aw && gH().length === 0), String(r2));
  await ev(A, () => Object.keys(localStorage).filter(k => k.startsWith('fill')).forEach(k => localStorage.removeItem(k)));
  await ev(A, () => { _finishWContinue(false); });
  await wait(800);
  const b = await snap(A);
  check('live storage full: Finish again after freeing space saves it once, with no second claim on the row', !b.aw && b.hist.filter(w => w.id === sid).length === 1 && db.ops.slice(ops0).every(o => o[0] !== 'update'), JSON.stringify(db.ops.slice(ops0)));
  check('live storage full: PR committed once, from the saved workout', b.prs.cex1 && b.hist[0].prCount === 1, JSON.stringify(b.prs));
  check('live storage full: no console errors', A.errors.length === 0, A.errors.join(' | '));
  await A.ctx.close();
}
// Single / Both (2026-10-16): a per-set s.single tapped on one device reaches the other through the ordinary set
// stamping (liveSig covers every set field), and a toggle racing an edit to another set loses neither.
export async function liveSingleBoth() {
  const db = makeDb(); const A = await device(db, 'phone-A'), B = await device(db, 'wear-B');
  await ev(A, () => { startRW('r1');
    aw.exercises.push({ exId: 'Hammer_Curls', name: 'Hammer Curls', muscle: 'biceps', equip: 'dumbbell', tracking: 'weight_reps',
      sets: [{ weight: 20, reps: 10, done: true }, { weight: 20, reps: 10, done: true }] });
    renderWS(); clearTimeout(_livePushT); return liveSync(); });
  const wire = live(db.row.doc.exercises.find(e => e.exId === 'Hammer_Curls').sets).map(s => s.single);
  check('live single/both: default Both goes on the wire as single:false on each set', JSON.stringify(wire) === '[false,false]', JSON.stringify(wire));
  check('live single/both: other device picks up the session', (await ev(B, () => liveResumeRemote())) === 'resumed');
  await B.page.locator('#eb1 .sr').nth(0).locator('.sbp button', { hasText: 'Single' }).tap();
  await ev(B, () => { clearTimeout(_livePushT); return liveSync(); });
  await ev(A, () => liveSync());
  const a = await ev(A, () => ({ f: aw.exercises[1].sets.map(s => s.single), on: [...document.querySelectorAll('#eb1 .sr')].map(r => r.querySelector('.sbp .on').textContent) }));
  check('live single/both: a Single tapped on one device reaches the other (state and button)', JSON.stringify(a.f) === '[true,false]' && a.on.join() === 'Single,Both', JSON.stringify(a));
  // Race: A flips set 2 to Single while B changes set 1's reps, both on the same rev.
  await ev(A, () => { setSingleArm(1, 1, true); clearTimeout(_livePushT); });
  await ev(B, () => { uSet(1, 0, 'reps', '12'); clearTimeout(_livePushT); });
  const miss0 = db.casMiss; db.barrier(2);
  await Promise.all([ev(A, () => liveSync()), ev(B, () => liveSync())]);
  await ev(A, () => liveSync()); await ev(B, () => liveSync());
  const both = await Promise.all([A, B].map(d => ev(d, () => aw.exercises[1].sets.map(s => [s.single, s.reps]))));
  check('live single/both: a toggle racing another set\'s edit -- both survive on both devices', db.casMiss - miss0 >= 1 && both.every(x => JSON.stringify(x) === '[[true,12],[true,10]]'), JSON.stringify({ miss: db.casMiss - miss0, both }));
  // Finish on A: the history total counts the two Single sets x2.
  const sid = await ev(A, () => aw.id);
  await ev(A, () => { _finishWContinue(false); });
  await wait(1500);
  const h = await ev(A, sid => { const w = gH().find(x => x.id === sid); const e = w.exercises.find(x => x.exId === 'Hammer_Curls'); return { tv: w.totalVolume, f: e.sets.map(s => s.single) }; }, sid);
  check('live single/both: finished entry keeps the synced choices and counts them (2x20x12 + 2x20x10 = 880)', h.tv === 880 && JSON.stringify(h.f) === '[true,true]', JSON.stringify(h));
  check('live single/both: no console errors', A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
  await A.ctx.close(); await B.ctx.close();
}
// Suggested vs documented PR (2026-10-20) on the live path: A finishes alone with an estimate-only beat (suggested), then
// the watch's late set -- a real lift past what the estimate implied -- merges in. Both devices must end on ONE documented
// PR with no stale suggestion, and the finished entry's stars must match.
export async function liveSugPromote() {
  const db = makeDb(); const A = await device(db, 'phone-A'), B = await device(db, 'wear-B');
  const base = () => { S.s('prs', { cex1: { weight: 100, reps: 1, date: '2026-09-01T18:00:00.000Z' } }); S.s('prSug', {}); };
  await ev(A, base); await ev(B, base);
  const sid = await startShared(db, A, [[90, 8, true]]);   // e1RM 114 > 100 but lighter: suggested
  await ev(B, () => liveResumeRemote());
  db.offline.add('wear-B');
  await ev(B, () => { addSet(0); const s = aw.exercises[0].sets[1]; s.weight = 120; s.reps = 1; s.done = true; renderWS(); clearTimeout(_livePushT); return liveSync(); });
  await ev(A, () => { _finishWContinue(false); });
  await wait(800);
  const a0 = await ev(A, () => ({ prs: gPR(), sug: gPRSug(), w: gH()[0] }));
  check('live sug: A finished alone -- suggested 90 x 8, documented 100 x 1 untouched, 0 PRs', a0.sug.cex1 && a0.sug.cex1.weight === 90 && a0.prs.cex1.weight === 100 && a0.w.prCount === 0 && a0.w.sugSets.length === 1, JSON.stringify(a0));
  db.offline.delete('wear-B');
  const r = await ev(B, () => liveSync());
  await ev(A, () => liveSync());
  const sa = await ev(A, sid => { const w = gH().find(x => x.id === sid); return { prs: gPR(), sug: gPRSug(), w, n: prsOf(w).n, sugN: prsOf(w).sug.length }; }, sid);
  const sb = await ev(B, sid => { const w = gH().find(x => x.id === sid); return { prs: gPR(), sug: gPRSug(), w, n: prsOf(w).n, sugN: prsOf(w).sug.length }; }, sid);
  check('live sug: the late 120 x 1 merged in', r === 'late-merged', r);
  check('live sug: finisher promotes -- 120 x 1 documented, suggestion cleared, 1 PR on the late set, no suggested tag', sa.prs.cex1.weight === 120 && sa.prs.cex1.reps === 1 && !sa.sug.cex1 && sa.w.prCount === 1 && sa.w.prSets[0].si === 1 && sa.w.sugSets.length === 0 && sa.n === 1 && sa.sugN === 0, JSON.stringify(sa).slice(0, 600));
  check('live sug: the late device agrees (120 x 1, no suggestion, 1 PR)', sb.prs.cex1.weight === 120 && !sb.sug.cex1 && sb.w.prCount === 1 && sb.n === 1 && sb.sugN === 0, JSON.stringify(sb).slice(0, 600));
  check('live sug: no console errors', A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
  await A.ctx.close(); await B.ctx.close();
}

export const LIVE_SUITES = [liveWrites, liveConcurrent, liveFinishOnce, liveFinishLock, liveLateSets, liveLifecycle, liveFinishEdges, liveFinishClaimFails, liveConcurrentSwaps, liveFinishHungSync, liveFinishResumed, liveReorderStale, liveSwitchStale, liveTypingStale, liveEndedElsewhere, liveStartOverOpen, liveFinishStorageFull, liveSingleBoth, liveSugPromote];

// The app is killed (swiped away) right after tapping Finish: the Finish claim reached the
// server and flipped the row to 'finished', but the local commit never ran. On reopening, the
// resumed copy met its OWN finished row, took it for another device's finish, and closed
// without saving anything -- the workout vanished from history, with a "finished on your other
// phone" toast (2026-10-12 adversarial find). Also: Switch Exercise onto the exercise already in
// that slot used to wipe its logged sets; and a double-tapped Finish still commits exactly once.
export async function liveFinishResumed() {
  const db = makeDb(); const A = await device(db, 'phone-A'), B = await device(db, 'wear-B');
  const sid = await startShared(db, A, [[100, 5, true]]);
  const saved = await ev(A, () => JSON.stringify(aw));   // what jk_activeWorkout holds at the Finish tap
  const won = await ev(A, () => { aw.finishedBy = liveDevice() + ':n1'; return liveClaimFinish(liveWire(aw)).then(r => !!r.won); });
  // Reopen: a fresh page state resumes the saved copy (no finish nonce in it, no lock).
  await ev(A, s => { aw = JSON.parse(s); _finLock = null; _liveShadow = null; liveRebase(); beginW(); }, saved);
  const res = await ev(A, () => liveSync());
  const a = await snap(A);
  const toastTxt = await ev(A, () => document.getElementById('tc').textContent);
  check('live finish resumed: a Finish the server took before the app died is still saved to history, once', won && db.row.status === 'finished' && res === 'closed-mine' && a.hist.filter(w => w.id === sid).length === 1 && a.hist.find(w => w.id === sid).sets === 1 && !a.aw, JSON.stringify({ res, hist: a.hist.map(w => w.id) }));
  check('live finish resumed: the toast does not blame "your other phone" for this phone\'s own finish', !/other phone/.test(toastTxt), toastTxt);
  check('live finish resumed: its PR is committed', (a.prs.cex1 || {}).weight === 100, JSON.stringify(a.prs));
  await ev(A, () => { cm('fsModal'); });
  // Another device seeing that same finished row still commits nothing (it was not its Finish).
  await ev(B, () => { aw = null; return liveSync(); });
  check('live finish resumed: the other device does not create its own copy', !(await snap(B)).hist.some(w => w.id === sid));
  // Switch Exercise onto the exercise already in the slot: a no-op, not a wipe.
  db.row = null;
  await startShared(db, A, [[100, 5, true], [100, 5, true]]);
  await ev(A, () => { switchEx(0); toggleAEItem('cex1'); });
  const b = await snap(A);
  check('switch to itself: the slot keeps its 2 logged sets and records no swap', b.aw.exercises[0].sets.filter(s => s.done).length === 2 && !(b.aw.swaps && Object.keys(b.aw.swaps).length), JSON.stringify({ sets: b.aw.exercises[0].sets, swaps: b.aw.swaps }));
  // Double-tapped Finish: two confirm calls, one OK -> exactly one commit.
  const c0 = (await snap(A)).stats.commits;
  await ev(A, () => { finishW(); finishW(); });
  await ev(A, () => _cfDone(true));
  await wait(300);
  await ev(A, () => { if (_cfResolve) _cfDone(true); });
  await wait(1500);
  const c = await snap(A);
  check('double-tap Finish: one commit, workout closed', !c.aw && c.stats.commits === c0 + 1, JSON.stringify(c.stats));
  check('live finish resumed: no console errors', A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
  await A.ctx.close(); await B.ctx.close();
}

// The phone's Reorder Exercises modal is open while the watch adds (or removes) an exercise.
// Its rows were keyed by array index, so dropping a row in the now-stale list rebuilt
// aw.exercises from the wrong indices: the watch's new exercise -- sets logged on it and all --
// fell off the end, got tombstoned, and was deleted on BOTH devices (2026-10-12 adversarial find).
const dragFirstBelowSecond = () => {
  const cont = document.getElementById('reorderList'), rows = [...cont.children];
  const grip = rows[0].querySelector('.cdrag'), r0 = rows[0].getBoundingClientRect();
  grip.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientY: r0.top + r0.height / 2, bubbles: true }));
  cont.insertBefore(rows[1], rows[0]);
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7 }));
};
export async function liveReorderStale() {
  const db = makeDb(); const A = await device(db, 'phone-A'), B = await device(db, 'wear-B');
  const ids = d => ev(d, () => aw.exercises.map(e => e.exId).join());
  await ev(A, () => { startRW('r2'); aw.exercises[0].sets[0] = { weight: 50, reps: 5, done: true }; renderWS(); clearTimeout(_livePushT); return liveSync(); });
  await ev(B, () => liveResumeRemote());
  await ev(A, () => openReorder());
  await ev(B, () => { addExToWorkout('cex3'); aw.exercises[2].sets[0] = { weight: 200, reps: 8, done: true }; renderWS(); clearTimeout(_livePushT); return liveSync(); });
  await ev(A, () => liveSync());
  await ev(A, dragFirstBelowSecond);
  await ev(A, () => { clearTimeout(_livePushT); return liveSync(); });
  await ev(B, () => liveSync());
  const [a1, b1] = [await ids(A), await ids(B)];
  const bSet = await ev(B, () => { const e = aw.exercises.find(x => x.exId === 'cex3'); return e ? e.sets[0].weight : null; });
  check('live reorder (stale list): the watch\'s new exercise + its logged set survive a drag on the phone, both devices', a1 === 'cex2,cex1,cex3' && b1 === a1 && bSet === 200, a1 + ' / ' + b1 + ' / ' + bSet);
  // Reverse: the watch REMOVES an exercise while the phone's list is open; a drag must not
  // resurrect it or shuffle the wrong rows.
  await ev(A, () => { cm('reorderModal'); openReorder(); });   // list now: cex2, cex1, cex3
  await ev(B, () => { rmEx(aw.exercises.findIndex(e => e.exId === 'cex2')); clearTimeout(_livePushT); return liveSync(); });
  await ev(A, () => liveSync());
  await ev(A, dragFirstBelowSecond);   // stale rows: [cex2(gone), cex1, cex3] -> drag cex2 below cex1
  await ev(A, () => { clearTimeout(_livePushT); return liveSync(); });
  await ev(B, () => liveSync());
  const [a2, b2] = [await ids(A), await ids(B)];
  check('live reorder (stale list): an exercise the watch removed stays removed, the rest keep their order', a2 === 'cex1,cex3' && b2 === a2, a2 + ' / ' + b2);
  check('live reorder stale: no console errors', A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
  await A.ctx.close(); await B.ctx.close();
}

// Phone opens Switch Exercise on one slot; while the picker is open the watch removes (or
// moves) an exercise. The picker remembered the slot by INDEX, so the pick replaced whatever
// exercise now sat there -- wiping its logged sets on both devices (2026-10-12 adversarial find).
export async function liveSwitchStale() {
  const db = makeDb(); const A = await device(db, 'phone-A'), B = await device(db, 'wear-B');
  const exs = d => ev(d, () => aw.exercises.map(e => e.exId + ':' + e.sets.filter(s => s.done).map(s => s.weight).join('+')).join());
  await ev(A, () => { startRW('r2'); aw.exercises[1].sets[0] = { weight: 60, reps: 8, done: true }; renderWS(); clearTimeout(_livePushT); return liveSync(); });
  await ev(B, () => liveResumeRemote());
  // 1) The watch removes the very exercise being switched: nothing else is touched.
  await ev(A, () => switchEx(0));
  await ev(B, () => { rmEx(0); clearTimeout(_livePushT); return liveSync(); });
  await ev(A, () => liveSync());
  await ev(A, () => toggleAEItem('cex4'));
  const a1 = await exs(A), t1 = await ev(A, () => document.getElementById('tc').textContent);
  check('live switch (stale slot): the watch removed it -> no other exercise is replaced, he is told', a1 === 'cex2:60' && /removed on your other device/.test(t1) && !(await ev(A, () => document.getElementById('aeModal').classList.contains('open'))), a1 + ' | ' + t1);
  // 2) The watch MOVES exercises while the picker is open: the switch lands on the one he tapped.
  await ev(A, () => { addExToWorkout('cex1'); clearTimeout(_livePushT); return liveSync(); });   // phone: [Row(60), Bench]
  await ev(B, () => liveSync());
  await ev(A, () => switchEx(1));   // switch Bench
  await ev(B, () => { moveEx(0, 1); clearTimeout(_livePushT); return liveSync(); });   // watch: [Bench, Row(60)]
  await ev(A, () => liveSync());
  await ev(A, () => toggleAEItem('cex3'));
  const a2 = await exs(A);
  check('live switch (stale slot): the watch reordered -> the tapped exercise is switched, the logged one is kept', a2 === 'cex3:,cex2:60', a2);
  check('live switch stale: no console errors', A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
  await A.ctx.close(); await B.ctx.close();
}

// The phone is typing a weight while the watch removes an earlier exercise. liveRender holds
// the redraw back while an input has focus (never under his thumb), but aw is already merged,
// so the focused box's inline uSet(1,0,...) -- and the next tap on a stale "done" box -- hit
// whatever exercise now sits at that index (2026-10-12 adversarial find: 135 typed into
// Barbell Row's box landed on Leg Press). wsAt() maps the drawn index to the live one.
export async function liveTypingStale() {
  const db = makeDb(); const A = await device(db, 'phone-A'), B = await device(db, 'wear-B');
  const w = (d, id) => ev(d, id => { const e = aw.exercises.find(x => x.exId === id); return e ? e.sets.map(s => [Math.round(s.weight * 2.20462), s.reps, !!s.done]) : null; }, id);
  await ev(A, () => { startRW('r2'); addExToWorkout('cex3'); clearTimeout(_livePushT); return liveSync(); });   // [Bench, Row, Leg Press]
  await ev(B, () => liveResumeRemote());
  await A.page.locator('#wSession input.si').nth(2).tap();   // Row, set 1, weight box
  await ev(B, () => { rmEx(0); clearTimeout(_livePushT); return liveSync(); });   // the watch removes Bench meanwhile
  await ev(A, () => liveSync());
  await A.page.keyboard.type('135');
  check('live typing (stale layout): a weight typed into Row\'s box lands on Row, not on Leg Press', (await w(A, 'cex2'))[0][0] === 135 && (await w(A, 'cex3'))[0][0] === 0, JSON.stringify([await w(A, 'cex2'), await w(A, 'cex3')]));
  // The next tap -- Row's "done" box in the still-stale drawing -- ticks Row's set.
  await A.page.locator('#wSession .sd').nth(1).tap();
  await wait(100);
  check('live typing (stale layout): tapping Row\'s done box ticks Row\'s set, not Leg Press\'s', (await w(A, 'cex2'))[0][2] === true && (await w(A, 'cex3'))[0][2] === false, JSON.stringify([await w(A, 'cex2'), await w(A, 'cex3')]));
  // A box whose set the watch deleted is ignored rather than throwing or landing elsewhere.
  await ev(A, () => { renderWS(); });
  await A.page.locator('#wSession input.si').nth(2).tap();   // Leg Press, set 1, weight
  await ev(B, () => liveSync());
  await ev(B, () => { const e = aw.exercises.findIndex(x => x.exId === 'cex3'); aw.exercises.splice(e, 1); renderWS(); clearTimeout(_livePushT); return liveSync(); });
  await ev(A, () => liveSync());
  await A.page.keyboard.type('9');
  check('live typing (stale layout): typing into an exercise the watch removed changes nothing else', (await w(A, 'cex3')) === null && (await w(A, 'cex2'))[0][0] === 135, JSON.stringify(await ev(A, () => aw.exercises.map(e => e.exId))));
  check('live typing stale: no console errors', A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
  await A.ctx.close(); await B.ctx.close();
}

// Phone loses signal, finishes the shared workout offline, starts a new one and reconnects: the
// queued finish and the new session land back to back, so the watch never sees the 'finished'
// row -- only a different session on it. It used to treat that as "a workout is already in
// progress on your other phone, add this workout's sets to it?": "Add" double-counted its
// already-saved sets into the new workout, "Keep separate" left a zombie copy that later saved a
// duplicate (2026-10-12 adversarial find). Now it closes, unless closing could drop data.
export async function liveEndedElsewhere() {
  const db = makeDb(); const A = await device(db, 'phone-A'), B = await device(db, 'wear-B');
  const prompts = () => ev(B, () => _cfLog.splice(0));
  await ev(B, () => { window._cfLog = []; window.showConfirm = m => { _cfLog.push(m); return Promise.resolve(false); }; });
  const run = async ({ unsent = false, seenLongAgo = false } = {}) => {
    db.row = null;
    const sid = await startShared(db, A, [[100, 5, true]]);
    await ev(B, () => { aw = null; _liveSolo = null; return liveResumeRemote(); });
    db.offline.add('phone-A');
    await ev(B, () => { addSet(0); const s = aw.exercises[0].sets[1]; s.weight = 110; s.reps = 3; s.done = true; renderWS(); clearTimeout(_livePushT); return liveSync(); });
    await ev(A, () => { _finishWContinue(false); });
    await wait(1200);
    await ev(A, () => { cm('fsModal'); startRW('r1'); aw.exercises[0].sets[0] = { weight: 120, reps: 2, done: true }; renderWS(); clearTimeout(_livePushT); });
    const sid2 = await ev(A, () => aw.id);
    db.offline.delete('phone-A');
    await ev(A, () => liveFlushFinishQ().then(() => liveSync()));
    if (unsent) await ev(B, () => { addSet(0); const s = aw.exercises[0].sets[2]; s.weight = 115; s.reps = 2; s.done = true; renderWS(); clearTimeout(_livePushT); });
    if (seenLongAgo) await ev(B, () => { _liveSeenAt = Date.now() - 91 * 60000; });
    const res = await ev(B, () => liveSync());
    const a = await snap(A), b = await snap(B);
    return { sid, sid2, res, a, b, p: await prompts() };
  };
  const r1 = await run();
  check('live ended elsewhere: the watch closes the finished workout instead of offering to fold it into the new one', r1.res === 'ended' && !r1.b.aw && r1.p.length === 0, JSON.stringify({ res: r1.res, p: r1.p }));
  check('live ended elsewhere: the finished workout is saved once on the phone with the watch\'s set; the new session owns the row', r1.a.hist.filter(w => w.id === r1.sid).length === 1 && r1.a.hist.find(w => w.id === r1.sid).sets === 2 && db.row.session_id === r1.sid2 && db.row.status === 'active' && !r1.b.hist.some(w => w.id === r1.sid));
  // Sets typed on the watch that never reached the server: closing would drop them -> the old offer stands.
  await ev(A, () => { cm('fsModal'); aw = null; clearAW(); });
  const r2 = await run({ unsent: true });
  check('live ended elsewhere: with an unsent set on the watch it still offers (never silently drops a set)', r2.res === 'solo' && r2.b.aw && r2.p.length === 1, JSON.stringify({ res: r2.res, p: r2.p }));
  // Last saw its session on the row longer ago than the stale window: replacement may mean abandoned -> the old offer stands.
  await ev(A, () => { cm('fsModal'); aw = null; clearAW(); });
  const r3 = await run({ seenLongAgo: true });
  check('live ended elsewhere: when the replacement could be staleness it still offers', r3.res === 'solo' && r3.p.length === 1, JSON.stringify({ res: r3.res, p: r3.p }));
  check('live ended elsewhere: no console errors', A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
  await A.ctx.close(); await B.ctx.close();
}
