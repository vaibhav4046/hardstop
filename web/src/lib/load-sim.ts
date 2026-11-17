import type { SimClass } from './session.ts'

/** The EVM and the compiled vault are a large download, so they load only when a vault is needed. */
export const loadSim = (): Promise<SimClass> => import('./hardstop/sim.ts').then((module) => module.Sim)
