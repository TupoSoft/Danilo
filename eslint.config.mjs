import pravila from 'eslint-config-love'

export default [
    {
        ...pravila,
        files: ['**/*.js', '**/*.ts'],
        rules: {
            ...pravila.rules,
            'promise/param-names': [
                'error',
                { resolvePattern: '^_?(?:resolve|razrijesi)$', rejectPattern: '^_?(?:reject|odbij)$' },
            ],
        },
    },
    {
        files: ['test/**/*.ts'],
        rules: {
            '@typescript-eslint/no-magic-numbers': 'off',
        },
    },
]
