# Smjernice za rad na projektu Danilo

Ova datoteka je glavni izvor projektnih instrukcija za agente. `CLAUDE.md` upućuje na nju.
Prije izmjena pročitaj relevantni kod, README i eventualne instrukcije u poddirektorijumima.
Izričiti zahtjev korisnika ima prednost nad podrazumijevanim pravilima ovog projekta.

## Komunikacija

-   Prije odgovora provjeri formulaciju korisnika, bez obzira na jezik poruke.
-   Ako postoji stvarna gramatička, pravopisna ili stilska nepravilnost, kratko je navedi i ponudi prirodniju formulaciju.
    Sačuvaj jezik, dijalekat, registar i namjeru korisnika; zatim odgovori na zahtjev. Pravilni dijalekatski oblici nijesu
    greške sami po sebi.
-   Ako je formulacija prirodna, ne komentariši je.
-   U završnom odgovoru navedi bitne izmjene, izvršene provjere i stvarna ograničenja. Ne tvrdi da je nešto provjereno
    ako provjera nije izvršena.

## Jezik i nazivi

-   Projektni nazivi i tekst su na crnogorskom jeziku, latinicom.
-   Identifikatori, nazivi klasa, metoda, tipova, konstanti, datoteka, direktorijuma i razvojnih komandi koriste ASCII.
    Koristi dosljednu transliteraciju: `c`, `s`, `z`, `dj`.
-   Dokumentacija, komentari i opisi testova mogu koristiti dijakritičke znakove.
-   Poruke bota, logovi, poruke grešaka, validacije i uputstva za generisanje citata koriste dijakritičke znakove.
    Očekivane vrijednosti u testovima moraju odgovarati stvarnim porukama.
-   Sačuvaj propisane nazive JavaScripta, TypeScripta, biblioteka i spoljnih API polja. Koristi crnogorske lokalne
    nazive ili uvozne alijase gdje to ima smisla, bez uvođenja omotača samo radi prevoda.
-   Pri preimenovanju uskladi sve uvoze, pozive, testove, package komande, Cloudflare konfiguraciju i dokumentaciju.

## Obim i jednostavnost

-   Implementiraj najmanje potpuno rješenje za traženo ponašanje.
-   Daj prednost postojećim datotekama, alatima i obrascima repozitorijuma.
-   Dodaj datoteke, zavisnosti, apstrakcije ili komande samo kada su neophodne za trenutne zahtjeve.
    Moguća buduća korist nije dovoljan razlog.
-   Koristi postojeće CLI alate pružalaca usluga prije pisanja sopstvenih omotača.
-   Dokumentaciju drži u postojećim dokumentima osim kada je razdvajanje neophodno.
-   Ne dodaj dnevnike izvršenja, evidencije napretka ili datoteke za podešavanje osim kada su traženi.
-   Prije pravljenja datoteka kratko objasni zašto je svaka neophodna.
-   Prije završetka ukloni nepotrebne dodatke, uz očuvanje traženog ponašanja i smislenih provjera.

## Inženjerski pristup

-   Sačuvaj postojeće konvencije i ugovore osim kada zahtjev traži njihovu izmjenu.
-   Pravi najmanju zaokruženu izmjenu. Ne dodaj nepovezane refaktore, spekulativne funkcije ili zavisnosti bez potrebe.
-   Primjenjuj Clean Architecture, Hexagonal Architecture, Clean Code i SOLID pragmatično. Koristi postojeće granice;
    ne uvodi slojeve, portove, fabrike ili generičke repozitorijume bez konkretnog razloga.
-   [ARCH-1] Domen i poslovna pravila ne zavise od HTTP-a, baze, UI okvira ili SDK-ova. Aplikacioni slučajevi upotrebe
    ne zavise od konkretnih infrastrukturnih adaptera. Povezivanje konkretnih zavisnosti pripada Cloudflare adapterima
    u `src/cloudflare/`, koje izvozi ulazna tačka `src/worker.ts`; ne izmišljaj domenske slojeve za trivijalne transformacije.
-   [CODE-1] Koristi jasne nazive i eksplicitan tok izvršavanja. Komentari objašnjavaju namjeru i ograničenja.
-   [CODE-6] Razlikuj očekivane neuspjehe od sistemskih grešaka. Sačuvaj uzrok greške i obradi je na odgovarajućoj granici;
    ne pretvaraj neuspjeh u prividno uspješan prazan rezultat.
-   [SEC-1] Sačuvaj autorizaciju i bezbjedno rukovanje tajnama. Ne zapisuj tokene, kredencijale ili osjetljive zahtjeve.
-   [SEC-2] Sačuvaj spoljne ugovore, uključujući Cloudflare vezivanja iz `cloudflare.config.ts` i Telegram komande.
-   Za TypeScript koristi jasne tipove na granicama, bez `any`, nesigurnih tvrdnji o tipu i neobrađenih obećanja.

## GitHub statistika i vrijeme

-   Broje se komitovi sa svih grana. Isti SHA se broji jednom po repozitorijumu; u različitim repozitorijumima broji se
    zasebno.
-   Učitaj sve stranice članova, repozitorijuma, grana i komitova preko postojeće Octokit paginacije. Sačuvaj filtere
    autora, grane i vremena.
-   Vremenska zona je `Europe/Podgorica`. Koristi zajedničku konstantu `VREMENSKA_ZONA_IZVJESTAJA` za izvještaje i oba
    dnevna rasporeda.
-   Prije prvog GitHub zahtjeva uhvati jedan trenutak izvještaja. `since` je lokalna ponoć tog dana, a `until` taj
    trenutak; isti opseg važi za sve članove. Koristi postojeći Luxon proračun koji podržava ljetnje i zimsko vrijeme.
-   Trenutni raspored je statistika u 23:55 i motivacija u 12:00. Izvještaj obuhvata dan do trenutka početka izvještaja.
-   Ako bilo koja GitHub stranica ne uspije, ne objavljuj djelimične rezultate niti lažne nule. Uspješan prazan odgovor
    ostaje ispravan prazan rezultat.
-   Ručni `/stats` dobija kratku poruku o nedostupnosti u izvornoj niti. Zakazana greška se bezbjedno bilježi, bez slanja
    izvještaja sa statistikom. Sačuvaj razliku između ručnog odgovora i slanja u podešeni razgovor.

## Razvoj i provjere

Koristi postojeći pnpm i skripte iz `package.json`:

```shell
pnpm worker-razvoj
pnpm worker-izgradi
pnpm test
pnpm provjeri-tipove
pnpm exec eslint src test
```

-   Testovi koriste `node:test` i postojeći `ts-node` učitavač preko `test/pokreni.ts`, koji otkriva `test/*.test.ts`.
-   [TEST-1] Provjeravaj ponašanje, granice i bitne neuspjehe, umjesto privatnih detalja implementacije.
-   [TEST-4] Za ispravku greške dodaj odgovarajuću regresionu provjeru gdje je korisna. Za statistiku obrati pažnju na
    duplikate, kasnije stranice, neuspjehe, ponoć, promjenu računanja vremena i Telegram niti.
-   Testovi koriste probne podatke i zamjene za servise. Ne zahtijevaj produkcione kredencijale niti stvarne GitHub,
    Telegram ili OpenAI pozive. Vrati zamijenjene metode, satove i promjenljive okruženja poslije provjere.
-   [TEST-5] Pokreni relevantne testove, provjeru tipova i ESLint za izmjene koda. Za izmjene same dokumentacije provjeri
    formatiranje, sadržaj i veze.
-   Koristi postojeći Prettier za izmijenjene datoteke i provjeri `git diff --check`. Razlikuj upozorenja o konverziji
    završetaka redova od stvarnih grešaka.
-   Prije završetka pregledaj konačni diff zbog slučajnih izmjena, neusklađenih naziva, narušenih ugovora i nedostajuće
    obrade neuspjeha.

## Pregledi koda i pull requestovi

-   U pregledu prijavljuj konkretne, ponovljive probleme: greške, gubitak podataka, bezbjednosne propuste, narušene
    ugovore i važne nedostajuće testove. Ne popunjavaj nalaze stilskim preferencijama.
-   Za svaki nalaz navedi ozbiljnost, datoteku i redove, stvarni scenario neuspjeha, relevantno pravilo ili provjerljiv
    ugovor i najmanju bezbjednu ispravku. Jasno odvoji potvrđene probleme od pretpostavki.
-   Naslov i opis PR-a treba da opisuju konačni problem i ponašanje, bitne promjene, kompatibilnost i stvarno izvršene
    provjere. Izostavi istoriju razgovora i napuštene pristupe osim kada objašnjavaju važan kompromis.
