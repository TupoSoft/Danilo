# Danilo - bot smarač

Danilo je Telegram bot za programersku ekipu TupoSoft.

Piše na crnogorskom jeziku, latinicom, uz malo humora. Voli besplatno pivo petkom.

## Šta radi

-   Priprema kratak, duhovit pregled dnevnog rada na GitHub projektima organizacije.
-   U pregledu povezuje važne promjene, uz linkove do pomenutih PR-ova i korisnička imena njihovih autora.
-   Šalje kratke motivacione poruke za ekipu.

Pregledi nastaju uz pomoć vještačke inteligencije, pa mogu sadržati greške ili propustiti dio aktivnosti.

## Komande

| Komanda     | Namjena                                      |
| ----------- | -------------------------------------------- |
| `/start`    | Pozdrav od Danila.                           |
| `/stats`    | Duhoviti pregled današnje GitHub aktivnosti. |
| `/motivate` | Kratka motivaciona poruka.                   |
| `/poop`     | Reakcija 💩 na poruku.                       |

Komande mogu koristiti samo administratori bota.

## Dnevni raspored

-   **12:00** — motivaciona poruka.
-   **23:55** — dnevni pregled rada.

Vrijeme se računa prema Podgorici, uz ljetnje i zimsko računanje vremena.
Pregled se odnosi na promjene od ponoći do početka izvještaja, pa posljednjih pet minuta dana nije uključeno
u pregled zakazan za 23:55.

## Licenca

Projekat je dostupan pod [MIT licencom](LICENSE).
