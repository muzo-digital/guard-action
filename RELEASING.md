# Releasen

1. `package.json` en `src/version.js` naar de nieuwe versie; `npm test` groen; merge naar `main`.
2. Canary: quality-guard draait op `@main`. Open of push een test-PR in muzo-digital/quality-guard
   en controleer dat de Muzo-job slaagt en de comment klopt.
3. Tag: `git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z`.
4. Kanaal verschuiven: `git tag -f v1 vX.Y.Z && git push -f origin v1`.
5. Terugdraaien: `git tag -f v1 <vorige vX.Y.Z> && git push -f origin v1`. Klanten draaien
   bij hun volgende PR-event weer de vorige versie.

De tags `v*` zijn beschermd met een tag-ruleset (alleen admins mogen `v*` aanmaken, verplaatsen of verwijderen): `v1` bepaalt welke code bij élke klant draait met hun PR-schrijfrechten.

Een wijziging aan het payloadcontract, de inputs, of de events/permissions die het
klanttemplate nodig heeft, is een nieuwe major (`v2`). Daarvoor moet de klant zelf zijn
workflow aanpassen.
