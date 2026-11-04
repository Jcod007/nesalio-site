import type { ReactNode } from "react";
import styles from "./AccountPage.module.css";

export function AccountPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <a className={styles.brand} href="https://nesalio.com">Nesalio</a>
        <p className={styles.kicker}>Mathématiques · Secondaire 4 et 5</p>
        <h1>{title}</h1>
        {children}
        <p className={styles.privacy}>
          Utilise ton courriel pour recevoir un code de connexion. Aucun mot de passe à retenir.
          {" "}<a href="https://nesalio.com/confidentialite" target="_blank" rel="noopener noreferrer">Confidentialité</a>
        </p>
      </div>
    </main>
  );
}

export function AccountUnavailable() {
  return (
    <AccountPage title="La connexion sera bientôt de retour">
      <p>Ton espace est temporairement indisponible. Réessaie un peu plus tard.</p>
      <a href="https://nesalio.com">Retour au site Nesalio</a>
    </AccountPage>
  );
}
