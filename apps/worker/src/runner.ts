import type { Db } from './db.js';
import { fingerprint } from './fingerprint.js';
import { errorMessage, log } from './log.js';
import { SourceChangedError, type Source } from './types.js';

export type Alert = (text: string) => Promise<void>;

// Bij deze aantallen opeenvolgende fouten krijgt de beheerder een melding.
const ALERT_AT = new Set([3, 30, 300]);

// Eén run van één bron: ophalen → vingerafdruk vergelijken → zo nodig verwerken.
export async function runSource(source: Source, db: Db, alert: Alert, lastFp: { value: string | null }) {
  const startedAt = new Date();
  try {
    const { items, complete } = await source.fetchAll();
    const fp = fingerprint(items);

    if (fp === lastFp.value) {
      await db.recordRun(source.id, startedAt, true, undefined, items.length);
      log.debug('ongewijzigd', { source: source.id, items: items.length });
      return;
    }

    const result = await db.ingest(source.id, items, fp, complete, startedAt);
    lastFp.value = fp;
    log.info('verwerkt', { source: source.id, items: items.length, ms: Date.now() - startedAt.getTime(), ...result });
  } catch (e) {
    const message = errorMessage(e);
    log.error('run mislukt', { source: source.id, error: message });
    const failures = await db.recordRun(source.id, startedAt, false, message).catch((dbError) => {
      log.error('run vastleggen mislukt', { error: errorMessage(dbError) });
      return 0;
    });
    if (e instanceof SourceChangedError || ALERT_AT.has(failures)) {
      await alert(`⚠️ huurradar: bron ${source.name} faalt (${failures}x achter elkaar)\n${message}`);
    }
  }
}
