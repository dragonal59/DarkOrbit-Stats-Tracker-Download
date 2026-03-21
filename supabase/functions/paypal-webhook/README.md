# paypal-webhook

Edge Function pour recevoir les webhooks PayPal et mettre à jour les profils.

## Variables d'environnement (Supabase Dashboard → Project Settings → Edge Functions)

| Variable | Description |
|----------|-------------|
| `PAYPAL_WEBHOOK_ID` | ID du webhook configuré dans PayPal Developer |
| `PAYPAL_CLIENT_ID` | Client ID de l'app PayPal (Live) |
| `PAYPAL_CLIENT_SECRET` | Client Secret de l'app PayPal (Live) |

## Déploiement

```bash
supabase functions deploy paypal-webhook --no-verify-jwt
```

`--no-verify-jwt` : les webhooks PayPal ne sont pas authentifiés via JWT Supabase.

## URL webhook

Après déploiement :
```
https://[PROJECT_REF].supabase.co/functions/v1/paypal-webhook
```

À configurer dans [PayPal Developer → Webhooks](https://developer.paypal.com/dashboard/applications/) (Live).

## Événements traités

| Événement | badge | status |
|-----------|-------|--------|
| BILLING.SUBSCRIPTION.ACTIVATED | PRO | active |
| BILLING.SUBSCRIPTION.CANCELLED | FREE | active |
| BILLING.SUBSCRIPTION.SUSPENDED | FREE | suspended |
| PAYMENT.SALE.COMPLETED | PRO | active |
| PAYMENT.SALE.DENIED | FREE | suspended |

L'utilisateur est identifié via `paypal_subscription_id` dans la table `profiles`.
