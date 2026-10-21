import { boxWithLidParts, profileMeshShape, type ReadyPart } from "@/lib/readyParts";
import { libraryShapeAssets, makeShapeFromAsset } from "@/lib/shapeCatalog";
import { t } from "@/lib/i18n";

/*
 * Fork (build 17): three starter designs on the home screen, so someone new has something real
 * to open, change and print in their first minute rather than an empty plate. Each is made of the
 * ordinary shapes and ready-made parts, so everything in it can be resized, ungrouped and edited.
 */

export type StarterId = "box" | "keyring" | "stand";
export const STARTER_IDS: readonly StarterId[] = ["box", "keyring", "stand"];

function asset(id: string) {
  const found = libraryShapeAssets.find((entry) => entry.id === id);
  if (!found) throw new Error(`No ${id} shape in the library`);
  return found;
}

/** A name keyring: a rounded tag with a ring hole, and raised letters to type over. */
function keyringParts(): ReadyPart[] {
  const tag = makeShapeFromAsset(asset("roundedBox"), { x: 0, z: 0, elevation: 0 }, { width: 56, depth: 20, height: 3, cornerFillet: 5, topBottomFillet: 0 });
  const ring = makeShapeFromAsset(asset("cylinder"), { x: -21, z: 0, elevation: -1 }, { width: 5, depth: 5, height: 5 });
  const letters = makeShapeFromAsset(asset("text"), { x: 5, z: 0, elevation: 3 }, { text: "NAME", width: 34, depth: 10, height: 1.6 });
  return [
    { name: t("starter.keyringTag"), shapes: [{ ...tag, name: t("starter.keyringTag"), color: "#1f6fd1" }, { ...ring, name: t("starter.keyringHole"), hole: true }], group: true },
    { name: t("starter.keyringText"), shapes: [{ ...letters, text: "NAME", name: t("starter.keyringText"), color: "#f2f2f2" }], group: false },
  ];
}

/**
 * A phone stand from the side: a base, a front lip the phone's edge sits behind, and a backrest
 * leaning back at about 65 degrees, pushed out 70 mm wide.
 */
export const PHONE_STAND_OUTLINE: [number, number][] = [
  [0, 0], [70, 0], [70, 4], [22, 4], [52, 68], [46, 68], [16, 4], [4, 4], [4, 12], [0, 12],
];

function standParts(): ReadyPart[] {
  const stand = profileMeshShape(t("starter.stand"), "#2f9e44", PHONE_STAND_OUTLINE, 70);
  return [{ name: t("starter.stand"), shapes: [stand], group: false }];
}

export function starterParts(id: StarterId): ReadyPart[] {
  if (id === "box") return boxWithLidParts({ width: 60, depth: 40, height: 30, radius: 3 }, { box: t("readyParts.boxName"), lid: t("readyParts.lidName") });
  if (id === "keyring") return keyringParts();
  return standParts();
}
