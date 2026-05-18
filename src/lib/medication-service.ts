/**
 * Barrel re-export for the legacy medication-service module.
 *
 * The implementation was split into focused services:
 *   - prescription-service.ts  — prescription CRUD
 *   - phase-service.ts         — medication phases + addMedicationToPrescription
 *   - inventory-service.ts     — inventory items, transactions, stock
 *
 * This barrel preserves the old import surface for one release so callers
 * keep compiling. A follow-up PR will migrate import sites and delete it.
 */

export {
  addPrescription,
  updatePrescription,
  deletePrescription,
  getPrescriptions,
  getActivePrescriptions,
  getInactivePrescriptions,
  getPrescriptionById,
  type CreatePrescriptionInput,
} from "./prescription-service";

export {
  addMedicationToPrescription,
  activatePhase,
  startNewPhase,
  updatePhase,
  deletePhase,
  getActivePhaseForPrescription,
  getPhasesForPrescription,
  type AddMedicationToPrescriptionInput,
  type CreatePhaseInput,
  type UpdatePhaseInput,
} from "./phase-service";

export {
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  adjustStock,
  updateInventoryTransaction,
  deleteInventoryTransaction,
  getInventoryForPrescription,
  getActiveInventoryForPrescription,
  getAllInventoryItems,
  getAllActiveInventoryItems,
  getInventoryTransactions,
} from "./inventory-service";
