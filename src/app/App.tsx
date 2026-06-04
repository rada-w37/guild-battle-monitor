import { featureFlags } from "../config/featureFlags";
import { FirebasePhase0App } from "../features/notifications/FirebasePhase0App";
import { GuildBattlePlaceholder } from "../features/guildBattle/GuildBattlePlaceholder";

export function App() {
  return featureFlags.firebase ? <FirebasePhase0App /> : <GuildBattlePlaceholder />;
}
