import type { TrainDeparture } from '@/lib/providers/irail';
import { todayAt } from '@/lib/time';

export type LeavePlan = {
  /** Heure a laquelle il faut quitter la maison, epoch ms. */
  leaveAt: number;
  train: TrainDeparture;
  /** Minutes de marge a l'arrivée par rapport a l'heure de bureau visee. */
  slack: number;
  /** Vrai si ce train arrive apres l'heure visee : aucun train ne convient plus. */
  late: boolean;
};

/**
 * Choisit le dernier train qui te depose au bureau avant l'heure visee.
 * S'il n'y en a plus, garde le prochain train possible et le signale comme tardif.
 */
export function planDeparture(
  departures: TrainDeparture[],
  workStartClock: string,
  now = Date.now(),
): LeavePlan | null {
  const target = todayAt(workStartClock).getTime();
  // Une minute de tolerance : un train qu'on peut encore attraper en pressant le pas.
  const catchable = departures.filter((d) => !d.canceled && d.leaveAt >= now - 60_000);
  if (catchable.length === 0) return null;

  const inTime = catchable.filter((d) => d.atWork <= target);
  const train = inTime.at(-1) ?? catchable[0];

  return {
    leaveAt: train.leaveAt,
    train,
    slack: Math.round((target - train.atWork) / 60_000),
    late: train.atWork > target,
  };
}
