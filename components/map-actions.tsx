"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { HoverTarget } from "@/lib/hover";

type MapActions = {
  openDirectory: (directory: string) => void;
  closeDirectory: (directory: string) => void;
  selectFile: (path: string) => void;
  clearSelection: () => void;
  hover: HoverTarget | null;
  setHover: (hover: HoverTarget | null) => void;
  directoryOf: ReadonlyMap<string, string>;
};

const MapActionsContext = createContext<MapActions | null>(null);

export function MapActionsProvider({
  actions,
  children,
}: {
  actions: MapActions;
  children: ReactNode;
}) {
  return (
    <MapActionsContext.Provider value={actions}>
      {children}
    </MapActionsContext.Provider>
  );
}

export function useMapActions(): MapActions {
  const actions = useContext(MapActionsContext);
  if (actions === null) {
    throw new Error("Map actions are missing");
  }
  return actions;
}
