-- shared_events : une seule ligne (id fixe). Supprime les doublons créés avant la correction.
DELETE FROM public.shared_events
WHERE id != '00000000-0000-0000-0000-000000000001'::uuid;
