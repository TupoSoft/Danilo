import {
    bindings as vezivanja,
    defineConfig as definisiKonfiguraciju,
    exports as izvozi,
    triggers as okidaci,
} from 'cf/config'

export default definisiKonfiguraciju(({ mode: rezim }) => {
    const okruzenje = rezim ?? 'development'
    const naziv = `danilo-${okruzenje}`

    return {
        worker: {
            name: naziv,
            entrypoint: './src/worker.ts',
            compatibilityDate: '2026-10-30',
            compatibilityFlags: ['nodejs_compat'],
            env: {
                OKRUZENJE: vezivanja.text(okruzenje),
                BOT_TOKEN: vezivanja.secret(),
                BOT_USERNAME: vezivanja.secret(),
                TELEGRAM_WEBHOOK_SECRET: vezivanja.secret(),
                GITHUB_TOKEN: vezivanja.secret(),
                GITHUB_ORG: vezivanja.secret(),
                OPENAI_API_TOKEN: vezivanja.secret(),
                ADMIN_TELEGRAM_IDS: vezivanja.secret(),
                TELEGRAM_CHAT_ID: vezivanja.secret(),
                STATISTIKA_POSLOVI: vezivanja.workflow({
                    name: `${naziv}-statistika`,
                    worker: naziv,
                    exportName: 'TokStatistike',
                }),
                MOTIVACIJA_POSLOVI: vezivanja.workflow({
                    name: `${naziv}-motivacija`,
                    worker: naziv,
                    exportName: 'TokMotivacije',
                }),
            },
            exports: {
                TokStatistike: izvozi.workflow({
                    name: `${naziv}-statistika`,
                    defaultRetention: { successRetention: '30 days', errorRetention: '30 days' },
                }),
                TokMotivacije: izvozi.workflow({
                    name: `${naziv}-motivacija`,
                    defaultRetention: { successRetention: '30 days', errorRetention: '30 days' },
                }),
            },
            // Vite zabranjuje posluživanje uvoza konfiguracije; test provjerava podudaranje sa izrazima rasporeda.
            triggers: [
                okidaci.scheduled({ schedule: '0 10,11 * * *' }),
                okidaci.scheduled({ schedule: '55 21,22 * * *' }),
            ],
            observability: {
                enabled: true,
                logs: { enabled: true, invocationLogs: false },
                // Telegramov token je dio putanje API-ja i može završiti u atributima automatskih tragova.
                traces: { enabled: false },
            },
        },
    }
})
