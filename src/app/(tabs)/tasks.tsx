import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import QuestSheet from "../../components/QuestSheet";

// Keep existing links working, using the same quest flow as Home.
export default function TasksScreen() {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  useFocusEffect(useCallback(() => { setVisible(true); }, []));
  return <QuestSheet visible={visible} initialScope="all" onClose={() => setVisible(false)}
    onStartSession={() => router.replace("/session")}
    onDismiss={(navigating) => {
      if (!navigating) {
        if (router.canGoBack()) router.back();
        else router.replace("/");
      }
    }} />;
}
