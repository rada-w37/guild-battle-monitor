import { featureFlags } from "../config/featureFlags";
import { FirebasePhase0App } from "../features/notifications/FirebasePhase0App";
import { GuildBattlePlaceholder } from "../features/guildBattle/GuildBattlePlaceholder";
import { useAppRoute } from "./appMode";

export function App() {
  const route = useAppRoute();

  if (route === null) {
    return <InvalidRoutePage />;
  }

  return featureFlags.firebase ? <FirebasePhase0App /> : <GuildBattlePlaceholder />;
}

function InvalidRoutePage() {
  return (
    <main>
      <h1>ページが見つかりません</h1>
      <p>Invalid URL</p>
    </main>
  );
}
