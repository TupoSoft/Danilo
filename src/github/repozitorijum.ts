import type { Octokit as GitHubKlijent } from '@octokit/rest'
import { VELICINA_GITHUB_STRANICE } from '../konstante.js'
import { Grana } from './grana.js'

export class Repozitorijum {
    constructor(
        private readonly naziv: string,
        private readonly organizacija: string,
        private readonly githubKlijent: GitHubKlijent,
    ) {}

    async dohvatiGrane(): Promise<Grana[]> {
        const grane = await this.githubKlijent.paginate(this.githubKlijent.repos.listBranches, {
            owner: this.organizacija,
            repo: this.naziv,
            per_page: VELICINA_GITHUB_STRANICE,
        })

        return grane.map(grana => new Grana(grana.name, this.naziv, this.organizacija, this.githubKlijent))
    }
}
