'use client';

import { useActionState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { updateEmail, updatePassword } from './actions';

export function SettingsForms({ email }: { email: string }) {
  const [emailState, emailAction, emailPending] = useActionState(updateEmail, {
    ok: false,
  });
  const [pwState, pwAction, pwPending] = useActionState(updatePassword, {
    ok: false,
  });

  return (
    <div className="grid gap-6 max-w-lg">
      {/* Changement d'email */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adresse email</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={emailAction} className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Email actuel : <span className="font-mono">{email}</span>
            </div>
            <input
              name="newEmail"
              type="email"
              placeholder="nouvel email"
              required
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" disabled={emailPending} size="sm">
              {emailPending ? 'Modification...' : 'Changer l\'email'}
            </Button>
            {emailState.error && (
              <p className="text-sm text-destructive">{emailState.error}</p>
            )}
            {emailState.ok && (
              <p className="text-sm text-green-600">
                Email modifié. Déconnectez-vous et reconnectez-vous avec le
                nouvel email.
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Changement de mot de passe */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mot de passe</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={pwAction} className="space-y-3">
            <input
              name="currentPassword"
              type="password"
              placeholder="mot de passe actuel"
              required
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              name="newPassword"
              type="password"
              placeholder="nouveau mot de passe (min 8 car.)"
              required
              minLength={8}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              name="confirmPassword"
              type="password"
              placeholder="confirmer le nouveau mot de passe"
              required
              minLength={8}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" disabled={pwPending} size="sm">
              {pwPending ? 'Modification...' : 'Changer le mot de passe'}
            </Button>
            {pwState.error && (
              <p className="text-sm text-destructive">{pwState.error}</p>
            )}
            {pwState.ok && (
              <p className="text-sm text-green-600">
                Mot de passe modifié avec succès.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
