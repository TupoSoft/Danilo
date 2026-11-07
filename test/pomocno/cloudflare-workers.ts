// Node ne pruža Cloudflare baznu klasu; korake i zavisnosti provjeravaju stvarne run metode.
class TokRada<Okruzenje> {
    constructor(
        protected readonly ctx: unknown,
        protected readonly env: Okruzenje,
    ) {}
}

export { TokRada as WorkflowEntrypoint }
