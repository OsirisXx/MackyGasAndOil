// ============================================================================
// Supabase Edge Function: price-change-scheduler
// Description: Monitors pending price change schedules and executes them
//              at the scheduled time. Runs every 60 seconds via cron.
//              Broadcasts to all POS terminals when prices change.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    console.log('[Scheduler] Starting price change scheduler check...')
    
    // Find all pending schedules that are due (scheduled_at <= now)
    const { data: dueSchedules, error: fetchError } = await supabase
      .from('price_change_schedules')
      .select('id, scheduled_at, pump_ids, branch_id')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
    
    if (fetchError) {
      console.error('[Scheduler] Error fetching due schedules:', fetchError)
      throw fetchError
    }
    
    console.log(`[Scheduler] Found ${dueSchedules?.length || 0} due schedules`)
    
    const results = []
    
    // Execute each schedule sequentially
    for (const schedule of dueSchedules || []) {
      console.log(`[Scheduler] Executing schedule ${schedule.id} (scheduled at ${schedule.scheduled_at})`)
      
      const { data, error } = await supabase.rpc(
        'execute_price_change_schedule',
        { p_schedule_id: schedule.id }
      )
      
      if (error) {
        console.error(`[Scheduler] Error executing schedule ${schedule.id}:`, error)
        results.push({
          schedule_id: schedule.id,
          success: false,
          error: error.message
        })
      } else {
        console.log(`[Scheduler] Schedule ${schedule.id} executed:`, data)
        results.push({
          schedule_id: schedule.id,
          success: data?.success || false,
          error: data?.error || null,
          pumps_updated: data?.pumps_updated || 0
        })
      }
    }
    
    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length
    
    console.log(`[Scheduler] Completed: ${successCount} succeeded, ${failureCount} failed`)
    
    // If any schedules were executed successfully, insert notification records
    if (successCount > 0) {
      console.log('[Scheduler] Inserting price change notifications')
      
      // Insert notification for each successfully executed schedule
      for (const schedule of dueSchedules || []) {
        const result = results.find(r => r.schedule_id === schedule.id)
        if (result && result.success) {
          const { error: notifError } = await supabase
            .from('price_change_notifications')
            .insert({
              branch_id: schedule.branch_id,
              pump_ids: schedule.pump_ids,
              schedule_id: schedule.id
            })
          
          if (notifError) {
            console.error(`[Scheduler] Error inserting notification for schedule ${schedule.id}:`, notifError)
          } else {
            console.log(`[Scheduler] Notification inserted for branch ${schedule.branch_id}`)
          }
        }
      }
      
      // Clean up old notifications (older than 1 hour)
      await supabase.rpc('cleanup_old_price_notifications')
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        processed: results.length,
        succeeded: successCount,
        failed: failureCount,
        results
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )
    
  } catch (error) {
    console.error('[Scheduler] Fatal error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    )
  }
})
