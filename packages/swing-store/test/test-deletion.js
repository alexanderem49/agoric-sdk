// @ts-check
import test from 'ava';
import path from 'path';

import { Buffer } from 'node:buffer';
import sqlite3 from 'better-sqlite3';
import { tmpDir } from './util.js';
import { initSwingStore } from '../src/swingStore.js';
import { makeSwingStoreExporter } from '../src/exporter.js';
import { importSwingStore } from '../src/importer.js';

async function* getSnapshotStream() {
  yield Buffer.from('abc');
}
harden(getSnapshotStream);

test('delete snapshots with export callback', async t => {
  const exportLog = [];
  const exportCallback = exports => {
    for (const [key, value] of exports) {
      exportLog.push([key, value]);
    }
  };
  const store = initSwingStore(null, { exportCallback });
  const { kernelStorage, hostStorage } = store;
  const { snapStore } = kernelStorage;
  const { commit } = hostStorage;

  await snapStore.saveSnapshot('v1', 10, getSnapshotStream());
  await snapStore.saveSnapshot('v1', 11, getSnapshotStream());
  await snapStore.saveSnapshot('v1', 12, getSnapshotStream());
  // nothing is written to exportCallback until endCrank() or commit()
  t.deepEqual(exportLog, []);

  await commit();

  t.is(exportLog.length, 4);
  t.is(exportLog[0][0], 'snapshot.v1.10');
  t.is(exportLog[1][0], 'snapshot.v1.11');
  t.is(exportLog[2][0], 'snapshot.v1.12');
  t.is(exportLog[3][0], 'snapshot.v1.current');
  exportLog.length = 0;

  // in a previous version, deleteVatSnapshots caused overlapping SQL
  // queries, and failed
  snapStore.deleteVatSnapshots('v1');
  await commit();

  t.deepEqual(exportLog, [
    ['snapshot.v1.10', null],
    ['snapshot.v1.11', null],
    ['snapshot.v1.12', null],
    ['snapshot.v1.current', null],
  ]);
  exportLog.length = 0;
});

test('delete transcripts with export callback', async t => {
  const exportLog = [];
  const exportCallback = exports => {
    for (const [key, value] of exports) {
      exportLog.push([key, value]);
    }
  };
  const store = initSwingStore(null, { exportCallback });
  const { kernelStorage, hostStorage } = store;
  const { transcriptStore } = kernelStorage;
  const { commit } = hostStorage;

  transcriptStore.initTranscript('v1');
  transcriptStore.addItem('v1', 'aaa');
  transcriptStore.addItem('v1', 'bbb');
  transcriptStore.addItem('v1', 'ccc');
  transcriptStore.rolloverSpan('v1');
  transcriptStore.addItem('v1', 'ddd');
  transcriptStore.addItem('v1', 'eee');
  transcriptStore.addItem('v1', 'fff');
  // nothing is written to exportCallback until endCrank() or commit()
  t.deepEqual(exportLog, []);

  await commit();

  t.is(exportLog.length, 2);
  t.is(exportLog[0][0], 'transcript.v1.0');
  t.is(exportLog[1][0], 'transcript.v1.current');
  exportLog.length = 0;

  // in a previous version, deleteVatTranscripts caused overlapping SQL
  // queries, and failed
  transcriptStore.deleteVatTranscripts('v1');
  await commit();

  t.deepEqual(exportLog, [
    ['transcript.v1.0', null],
    ['transcript.v1.current', null],
  ]);

  exportLog.length = 0;
});

const getExport = async (dbDir, artifactMode) => {
  const exporter = makeSwingStoreExporter(dbDir, { artifactMode });
  const exportData = new Map();
  for await (const [key, value] of exporter.getExportData()) {
    exportData.set(key, value);
  }
  const artifactNames = [];
  for await (const name of exporter.getArtifactNames()) {
    artifactNames.push(name);
  }
  await exporter.close();
  return { exportData, artifactNames };
};

const reImport = async (t, dbDir, artifactMode) => {
  const [dbDir2, cleanup] = await tmpDir('testdb2');
  t.teardown(cleanup);
  const exporter = makeSwingStoreExporter(dbDir, { artifactMode });
  const ss2 = await importSwingStore(exporter, dbDir2, { artifactMode });
  await ss2.hostStorage.commit();
  return sqlite3(path.join(dbDir2, 'swingstore.sqlite'));
};

test('slow deletion of transcripts', async t => {
  // slow transcript deletion should remove export-data as it removes
  // transcript spans and their items
  const v1 = 'v1';
  const exportLog = [];
  const exportCallback = exports => {
    for (const [key, value] of exports) {
      exportLog.push([key, value]);
    }
  };
  const [dbDir, cleanup] = await tmpDir('testdb');
  t.teardown(cleanup);
  const store = initSwingStore(dbDir, { exportCallback });
  const { kernelStorage, hostStorage } = store;
  const { transcriptStore } = kernelStorage;
  const { commit } = hostStorage;
  // look directly at DB to confirm changes
  const db = sqlite3(path.join(dbDir, 'swingstore.sqlite'));

  // two incarnations, two spans each

  transcriptStore.initTranscript(v1);
  transcriptStore.addItem(v1, 'aaa');
  transcriptStore.addItem(v1, 'bbb');
  transcriptStore.rolloverSpan(v1);
  transcriptStore.addItem(v1, 'ccc');
  transcriptStore.addItem(v1, 'ddd');
  transcriptStore.rolloverIncarnation(v1);
  transcriptStore.addItem(v1, 'eee');
  transcriptStore.addItem(v1, 'fff');
  transcriptStore.rolloverSpan(v1);
  transcriptStore.addItem(v1, 'ggg');
  transcriptStore.addItem(v1, 'hhh');
  await commit();
  t.is(exportLog.length, 4);
  t.is(exportLog[0][0], 'transcript.v1.0');
  t.is(exportLog[1][0], 'transcript.v1.2');
  t.is(exportLog[2][0], 'transcript.v1.4');
  t.is(exportLog[3][0], 'transcript.v1.current');
  exportLog.length = 0;

  t.is(db.prepare('SELECT COUNT(*) FROM transcriptItems').pluck().get(), 8);
  t.is(db.prepare('SELECT COUNT(*) FROM transcriptSpans').pluck().get(), 4);

  // an "operational"-mode export should list all spans, but only have
  // artifacts for the current one
  {
    const { exportData, artifactNames } = await getExport(dbDir, 'operational');
    // I don't care about order as much as this test implies, but
    // AVA's deepEqual enforces ordering, even among Sets
    t.deepEqual([...exportData.keys()].sort(), [
      'transcript.v1.0',
      'transcript.v1.2',
      'transcript.v1.4',
      'transcript.v1.current',
    ]);
    t.deepEqual(artifactNames, ['transcript.v1.6.8']);
    const db2 = await reImport(t, dbDir, 'operational');
    t.is(db2.prepare('SELECT COUNT(*) FROM transcriptItems').pluck().get(), 2);
    t.is(db2.prepare('SELECT COUNT(*) FROM transcriptSpans').pluck().get(), 4);
  }

  // an "archival"-mode export should list all four spans, with
  // artifacts for each
  {
    const { exportData, artifactNames } = await getExport(dbDir, 'archival');
    t.deepEqual([...exportData.keys()].sort(), [
      'transcript.v1.0',
      'transcript.v1.2',
      'transcript.v1.4',
      'transcript.v1.current',
    ]);
    t.deepEqual(artifactNames, [
      'transcript.v1.0.2',
      'transcript.v1.2.4',
      'transcript.v1.4.6',
      'transcript.v1.6.8',
    ]);
    const db2 = await reImport(t, dbDir, 'archival');
    t.is(db2.prepare('SELECT COUNT(*) FROM transcriptItems').pluck().get(), 8);
    t.is(db2.prepare('SELECT COUNT(*) FROM transcriptSpans').pluck().get(), 4);
  }

  // first deletion
  {
    // budget=1 will let it delete one span
    const dc = transcriptStore.deleteVatTranscripts(v1, 1);
    t.false(dc.done);
    t.is(dc.cleanups, 1);
    await commit();
    t.is(exportLog.length, 1);
    t.deepEqual(exportLog[0], ['transcript.v1.current', null]);
    exportLog.length = 0;
    t.is(db.prepare('SELECT COUNT(*) FROM transcriptItems').pluck().get(), 6);
    t.is(db.prepare('SELECT COUNT(*) FROM transcriptSpans').pluck().get(), 3);
  }

  // Exports in this partially-deleted state should be coherent: they
  // provide a subset of the older spans (the not-yet-deleted ones,
  // all of which have isCurrent=0) and no items (even for
  // not-yet-deleted spans). The import-time assertComplete() test
  // must be satisfied.

  {
    const { exportData, artifactNames } = await getExport(dbDir, 'operational');
    t.deepEqual([...exportData.keys()].sort(), [
      'transcript.v1.0',
      'transcript.v1.2',
      'transcript.v1.4',
    ]);
    t.deepEqual(artifactNames, []);
    const db2 = await reImport(t, dbDir, 'operational');
    t.is(db2.prepare('SELECT COUNT(*) FROM transcriptItems').pluck().get(), 0);
    t.is(db2.prepare('SELECT COUNT(*) FROM transcriptSpans').pluck().get(), 3);
  }

  {
    const { exportData, artifactNames } = await getExport(dbDir, 'archival');
    t.deepEqual([...exportData.keys()].sort(), [
      'transcript.v1.0',
      'transcript.v1.2',
      'transcript.v1.4',
    ]);
    t.deepEqual(artifactNames, []);
    const db2 = await reImport(t, dbDir, 'archival');
    t.is(db2.prepare('SELECT COUNT(*) FROM transcriptItems').pluck().get(), 0);
    t.is(db2.prepare('SELECT COUNT(*) FROM transcriptSpans').pluck().get(), 3);
  }

  // second deletion
  {
    const dc = transcriptStore.deleteVatTranscripts(v1, 1);
    t.false(dc.done);
    t.is(dc.cleanups, 1);
    await commit();
    t.is(exportLog.length, 1);
    t.deepEqual(exportLog[0], ['transcript.v1.4', null]);
    exportLog.length = 0;
    t.is(db.prepare('SELECT COUNT(*) FROM transcriptItems').pluck().get(), 4);
    t.is(db.prepare('SELECT COUNT(*) FROM transcriptSpans').pluck().get(), 2);
  }

  {
    const { exportData, artifactNames } = await getExport(dbDir, 'operational');
    t.deepEqual([...exportData.keys()].sort(), [
      'transcript.v1.0',
      'transcript.v1.2',
    ]);
    t.deepEqual(artifactNames, []);
    const db2 = await reImport(t, dbDir, 'operational');
    t.is(db2.prepare('SELECT COUNT(*) FROM transcriptItems').pluck().get(), 0);
    t.is(db2.prepare('SELECT COUNT(*) FROM transcriptSpans').pluck().get(), 2);
  }

  {
    const { exportData, artifactNames } = await getExport(dbDir, 'archival');
    t.deepEqual([...exportData.keys()].sort(), [
      'transcript.v1.0',
      'transcript.v1.2',
    ]);
    t.deepEqual(artifactNames, []);
    const db2 = await reImport(t, dbDir, 'archival');
    t.is(db2.prepare('SELECT COUNT(*) FROM transcriptItems').pluck().get(), 0);
    t.is(db2.prepare('SELECT COUNT(*) FROM transcriptSpans').pluck().get(), 2);
  }

  // last deletion, enough budget to finish
  {
    const dc = transcriptStore.deleteVatTranscripts(v1, 5);
    t.true(dc.done);
    t.is(dc.cleanups, 2);
    await commit();
    t.is(exportLog.length, 2);
    // v1.2 is actually deleted first, then v1.0, but sqlExportsGet
    // sorts the keys, so the callback sees v1.0 first
    t.deepEqual(exportLog[0], ['transcript.v1.0', null]);
    t.deepEqual(exportLog[1], ['transcript.v1.2', null]);
    exportLog.length = 0;
    t.is(db.prepare('SELECT COUNT(*) FROM transcriptItems').pluck().get(), 0);
    t.is(db.prepare('SELECT COUNT(*) FROM transcriptSpans').pluck().get(), 0);
  }

  {
    const dc = transcriptStore.deleteVatTranscripts(v1, 5);
    t.true(dc.done);
    t.is(dc.cleanups, 0);
    await commit();
    t.is(exportLog.length, 0);
  }

  {
    const { exportData, artifactNames } = await getExport(dbDir, 'archival');
    t.deepEqual([...exportData.keys()].sort(), []);
    t.deepEqual(artifactNames, []);
    const db2 = await reImport(t, dbDir, 'archival');
    t.is(db2.prepare('SELECT COUNT(*) FROM transcriptItems').pluck().get(), 0);
    t.is(db2.prepare('SELECT COUNT(*) FROM transcriptSpans').pluck().get(), 0);
  }
});

test('slow deletion of snapshots', async t => {
  // slow snapshot deletion should remove export-data as it removes
  // snapshots
  const v1 = 'v1';
  const exportLog = [];
  const exportCallback = exports => {
    for (const [key, value] of exports) {
      exportLog.push([key, value]);
    }
  };
  const [dbDir, cleanup] = await tmpDir('testdb');
  t.teardown(cleanup);
  const store = initSwingStore(dbDir, { exportCallback });
  const { kernelStorage, hostStorage } = store;
  const { snapStore } = kernelStorage;
  const { commit } = hostStorage;
  // look directly at DB to confirm changes
  const db = sqlite3(path.join(dbDir, 'swingstore.sqlite'));

  await snapStore.saveSnapshot(v1, 10, getSnapshotStream());
  await snapStore.saveSnapshot(v1, 11, getSnapshotStream());
  await snapStore.saveSnapshot(v1, 12, getSnapshotStream());
  // nothing is written to exportCallback until endCrank() or commit()
  t.deepEqual(exportLog, []);
  await commit();
  t.is(exportLog.length, 4);
  t.is(exportLog[0][0], 'snapshot.v1.10');
  t.is(exportLog[1][0], 'snapshot.v1.11');
  t.is(exportLog[2][0], 'snapshot.v1.12');
  t.deepEqual(exportLog[3], ['snapshot.v1.current', 'snapshot.v1.12']);
  exportLog.length = 0;

  t.is(db.prepare('SELECT COUNT(*) FROM snapshots').pluck().get(), 3);
  {
    // export should mention all spans, with a single current artifact
    const { exportData, artifactNames } = await getExport(dbDir, 'operational');
    t.deepEqual([...exportData.keys()].sort(), [
      'snapshot.v1.10',
      'snapshot.v1.11',
      'snapshot.v1.12',
      'snapshot.v1.current',
    ]);
    t.is(exportData.get('snapshot.v1.current'), 'snapshot.v1.12');
    t.deepEqual(artifactNames, ['snapshot.v1.12']);
  }

  // first deletion
  {
    // budget=1 will let it delete one snapshot
    const dc = snapStore.deleteVatSnapshots(v1, 1);
    t.false(dc.done);
    t.is(dc.cleanups, 1);
    await commit();
    t.is(exportLog.length, 1);
    t.deepEqual(exportLog[0], ['snapshot.v1.10', null]);
    exportLog.length = 0;
    t.is(db.prepare('SELECT COUNT(*) FROM snapshots').pluck().get(), 2);
  }

  {
    // export should mention fewer spans
    const { exportData, artifactNames } = await getExport(dbDir, 'operational');
    t.deepEqual([...exportData.keys()].sort(), [
      'snapshot.v1.11',
      'snapshot.v1.12',
      'snapshot.v1.current',
    ]);
    t.is(exportData.get('snapshot.v1.current'), 'snapshot.v1.12');
    t.deepEqual(artifactNames, ['snapshot.v1.12']);
    // that should be importable
    const db2 = await reImport(t, dbDir, 'operational');
    t.is(db2.prepare('SELECT COUNT(*) FROM snapshots').pluck().get(), 2);
    const db3 = await reImport(t, dbDir, 'archival');
    t.is(db3.prepare('SELECT COUNT(*) FROM snapshots').pluck().get(), 2);
  }

  // last deletion, enough budget to delete both remaining snapshots
  {
    const dc = snapStore.deleteVatSnapshots(v1, 5);
    t.true(dc.done);
    t.is(dc.cleanups, 2);
    await commit();
    t.is(exportLog.length, 3);
    t.deepEqual(exportLog[0], ['snapshot.v1.11', null]);
    t.deepEqual(exportLog[1], ['snapshot.v1.12', null]);
    t.deepEqual(exportLog[2], ['snapshot.v1.current', null]);
    exportLog.length = 0;
    t.is(db.prepare('SELECT COUNT(*) FROM snapshots').pluck().get(), 0);
  }

  {
    // export should mention nothing
    const { exportData, artifactNames } = await getExport(dbDir, 'operational');
    t.deepEqual([...exportData.keys()].sort(), []);
    t.deepEqual(artifactNames, []);
  }
});
