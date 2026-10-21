// Shared helper to log equipment history entries.
// Called after every equipment action (create, edit, checkout, return, status change, etc.)

export async function logEquipmentHistory(
  base44: any,
  entry: {
    equipment_id: string;
    equipment_name?: string;
    owner_id: string;
    actor_id: string;
    actor_name?: string;
    action: string;
    previous_status?: string;
    new_status?: string;
    previous_holder?: string;
    new_holder?: string;
    notes?: string;
  }
): Promise<void> {
  try {
    await base44.asServiceRole.entities.EquipmentHistory.create({
      equipment_id: entry.equipment_id,
      equipment_name: entry.equipment_name || '',
      owner_id: entry.owner_id,
      actor_id: entry.actor_id,
      actor_name: entry.actor_name || '',
      action: entry.action,
      previous_status: entry.previous_status || '',
      new_status: entry.new_status || '',
      previous_holder: entry.previous_holder || '',
      new_holder: entry.new_holder || '',
      notes: entry.notes || ''
    });
  } catch (e) {
    console.error('[equipmentHistory] log failed:', e?.message || e);
  }
}