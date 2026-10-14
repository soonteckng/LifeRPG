import { useEffect, useLayoutEffect } from "react";
import { useSavedRoutines } from "../hooks/useSavedRoutines";
import { clearSavedRoutineWidgets, publishSavedRoutineWidgets, selectSavedRoutineWidgetOwner } from "../services/routineWidgetService";

export default function RoutineWidgetLifecycle() {
  const { scope, ready, routines } = useSavedRoutines();
  useLayoutEffect(() => {
    selectSavedRoutineWidgetOwner(scope);
    return () => { if (scope) void clearSavedRoutineWidgets(scope); };
  }, [scope]);
  useEffect(() => { if (scope && ready) void publishSavedRoutineWidgets(scope, routines); }, [scope, ready, routines]);
  return null;
}
