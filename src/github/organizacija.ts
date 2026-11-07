import type { Octokit as GitHubKlijent } from '@octokit/rest'
import { VELICINA_GITHUB_STRANICE } from '../konstante.js'
import { Repozitorijum } from './repozitorijum.js'

export class Organizacija {
    constructor(
        private readonly naziv: string,
        private readonly githubKlijent: GitHubKlijent,
    ) {}

    async dohvatiClanove(): Promise<string[]> {
        const clanovi = await this.githubKlijent.paginate(this.githubKlijent.orgs.listMembers, {
            org: this.naziv,
            per_page: VELICINA_GITHUB_STRANICE,
        })

        return clanovi.map(clan => clan.login)
    }

    async dohvatiRepozitorijume(): Promise<Repozitorijum[]> {
        const repozitorijumi = await this.githubKlijent.paginate(this.githubKlijent.repos.listForOrg, {
            org: this.naziv,
            per_page: VELICINA_GITHUB_STRANICE,
        })

        return repozitorijumi.map(
            repozitorijum => new Repozitorijum(repozitorijum.name, this.naziv, this.githubKlijent),
        )
    }
}
