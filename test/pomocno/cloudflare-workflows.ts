// Node nema platformsku grešku; naziv i nasljeđivanje odgovaraju API-ju toka rada.
class GreskaBezPonavljanja extends Error {
    override name = 'NonRetryableError'
}

export { GreskaBezPonavljanja as NonRetryableError }
