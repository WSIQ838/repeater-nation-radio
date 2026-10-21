// Public endpoint: returns which operator tools are enabled. Reads the
// AdminSetting record as service role and projects only the tool flags so
// non-admin users can discover available tools without exposing settings.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const TOOL_KEYS = [
  'tool_frequency_calc', 'tool_tone_calc', 'tool_channel_planner',
  'tool_antenna_calc', 'tool_coax_calc', 'tool_power_calc',
  'tool_distance_calc', 'tool_weather', 'tool_sunrise_sunset',
  'tool_morse_code', 'tool_sdr',
];

export default async function(req: Request): Promise<Response> {
  const config: Record<string, boolean> = {};
  try {
    const base44 = createClientFromRequest(req);
    let settings: any = (await base44.asServiceRole.entities.AdminSetting.list('-updated_date', 1))[0];
    if (!settings) {
      settings = await base44.asServiceRole.entities.AdminSetting.create({
        maintenance_mode: false, registration_open: true, allow_new_repeaters: true,
        fcc_auto_verify: false, map_default_zoom: 4, updated_by_name: 'system',
      });
    }
    for (const k of TOOL_KEYS) config[k] = settings[k] !== false;
    config.radio_enabled = settings.radio_enabled !== false;
    config.radio_default_voice_name = settings.radio_default_voice_name || '';
  } catch (error) {
    console.error('[get-tools-config] error:', error?.message || error);
    // Fail open for the calculator-style tools; fail CLOSED for the radio --
    // it's a live voice feature with its own kill switch, so an unreadable
    // settings record should hide it rather than silently show it enabled.
    for (const k of TOOL_KEYS) config[k] = true;
    config.radio_enabled = false;
    config.radio_default_voice_name = '';
  }
  return Response.json({ config });
}