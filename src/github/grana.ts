import type { Octokit as GitHubKlijent } from '@octokit/rest'
import { VELICINA_GITHUB_STRANICE } from '../konstante.js'

export interface Komit {
    sha: string
}

export class Grana {
    constructor(
        private readonly naziv: string,
        private readonly repozitorijum: string,
        private readonly organizacija: string,
        private readonly githubKlijent: GitHubKlijent,
    ) {}

    async dohvatiKomitove(autor?: string, od?: string, doTrenutka?: string): Promise<Komit[]> {
        return await this.githubKlijent.paginate(this.githubKlijent.repos.listCommits, {
            owner: this.organizacija,
            repo: this.repozitorijum,
            sha: this.naziv,
            author: autor,
            since: od,
            until: doTrenutka,
            per_page: VELICINA_GITHUB_STRANICE,
        })
    }
}
