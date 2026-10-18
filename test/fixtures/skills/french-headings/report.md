# Revue : panier

**Décision :** Demander des modifications

**Résumé :** Le panier recalcule le total deux fois.

## Bloquant

- **Total recalculé deux fois** dans `src/panier/total.ts:10`.

  > Le total est calculé dans le hook puis dans le composant ; je garderais un seul endroit.

## À corriger

- Le test `src/panier/total.test.ts` ne couvre pas la remise.

## Suggestions mineures

- Renommer `tmp` en `subtotal` dans `src/panier/total.ts:22`.
