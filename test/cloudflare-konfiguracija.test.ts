import provjeri from 'node:assert/strict'
import { test as testiraj } from 'node:test'
import konfiguracija from '../cloudflare.config.js'
import { CRON_MOTIVACIJE, CRON_STATISTIKE } from '../src/cloudflare/cron.js'

void testiraj(
    'Cloudflare raspored uvijek uključuje motivaciju i statistiku uz postojeća podešavanja tokova rada',
    () => {
        const { worker: radnik } = konfiguracija({ mode: 'probno', isPreview: false })
        provjeri.deepEqual(radnik.triggers, [
            { type: 'scheduled', schedule: CRON_MOTIVACIJE },
            { type: 'scheduled', schedule: CRON_STATISTIKE },
        ])
        provjeri.equal(radnik.observability.enabled, true)
        provjeri.equal(radnik.observability.logs.enabled, true)
        provjeri.equal(radnik.observability.logs.invocationLogs, false)
        provjeri.equal(radnik.observability.traces.enabled, false)
        for (const definicija of [radnik.exports.TokStatistike, radnik.exports.TokMotivacije]) {
            provjeri.deepEqual(definicija.defaultRetention, {
                successRetention: '30 days',
                errorRetention: '30 days',
            })
        }
        provjeri.equal(radnik.exports.TokStatistike.name, 'danilo-probno-statistika')
        provjeri.equal(radnik.exports.TokMotivacije.name, 'danilo-probno-motivacija')
        provjeri.deepEqual(radnik.env.STATISTIKA_POSLOVI, {
            type: 'workflow',
            name: 'danilo-probno-statistika',
            worker: 'danilo-probno',
            exportName: 'TokStatistike',
        })
        provjeri.deepEqual(radnik.env.MOTIVACIJA_POSLOVI, {
            type: 'workflow',
            name: 'danilo-probno-motivacija',
            worker: 'danilo-probno',
            exportName: 'TokMotivacije',
        })
    },
)
