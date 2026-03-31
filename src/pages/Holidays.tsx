import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Calendar as CalendarIcon, Plus, Trash2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

interface Holiday {
  id: string;
  date: string;
  name: string;
  type: 'regular' | 'special';
}

export function Holidays() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [newHoliday, setNewHoliday] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    name: '',
    type: 'regular' as 'regular' | 'special'
  });

  useEffect(() => {
    fetchHolidays();
  }, []);

  async function fetchHolidays() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('holidays')
        .select('*')
        .order('date', { ascending: true });

      if (error) throw error;
      setHolidays(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddHoliday(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError(null);
      const { error } = await supabase
        .from('holidays')
        .insert([newHoliday]);

      if (error) throw error;
      
      setSuccess('Holiday added successfully!');
      setNewHoliday({
        date: format(new Date(), 'yyyy-MM-dd'),
        name: '',
        type: 'regular'
      });
      fetchHolidays();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDeleteHoliday(id: string) {
    try {
      const { error } = await supabase
        .from('holidays')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchHolidays();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function syncPhilippinesHolidays() {
    try {
      setSyncing(true);
      setError(null);
      setSuccess(null);

      const year = new Date().getFullYear();
      // Using Nager.Date API for Philippine holidays (PH)
      const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/PH`);
      if (!response.ok) throw new Error('Failed to fetch holidays from API');
      
      const apiHolidays = await response.json();
      
      const holidaysToInsert = apiHolidays.map((h: any) => ({
        date: h.date,
        name: h.localName || h.name,
        // Heuristic: Nager.Date doesn't explicitly distinguish PH "Regular" vs "Special" in a standard way
        // Usually, major ones are Regular. We'll default to 'regular' and let user edit if needed.
        // In PH, common special ones are Ninoy Aquino Day, All Saints Day, etc.
        type: h.types?.includes('Public') ? 'regular' : 'special'
      }));

      // Upsert logic (using date as unique key)
      const { error: upsertError } = await supabase
        .from('holidays')
        .upsert(holidaysToInsert, { onConflict: 'date' });

      if (upsertError) throw upsertError;

      setSuccess(`Successfully synced ${holidaysToInsert.length} holidays for ${year}!`);
      fetchHolidays();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-8 p-4"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Holiday Management</h2>
          <p className="mt-1 text-base text-gray-500">
            Manage Philippine holidays for payroll computation.
          </p>
        </div>
        <button
          onClick={syncPhilippinesHolidays}
          disabled={syncing}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Sync PH Holidays
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center shadow-sm">
          <AlertCircle className="w-5 h-5 mr-2" />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex items-center shadow-sm">
          <CheckCircle2 className="w-5 h-5 mr-2" />
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Add Holiday Form */}
        <div className="md:col-span-1">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 sticky top-24">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Holiday</h3>
            <form onSubmit={handleAddHoliday} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={newHoliday.date}
                  onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
                  className="w-full border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border px-4 py-2.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Holiday Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Christmas Day"
                  value={newHoliday.name}
                  onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                  className="w-full border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border px-4 py-2.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={newHoliday.type}
                  onChange={(e) => setNewHoliday({ ...newHoliday, type: e.target.value as 'regular' | 'special' })}
                  className="w-full border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border px-4 py-2.5"
                >
                  <option value="regular">Regular Holiday (Double Pay)</option>
                  <option value="special">Special Non-Working Day (1.3x Pay)</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full inline-flex justify-center items-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Holiday
              </button>
            </form>
          </div>
        </div>

        {/* Holiday List */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-lg font-semibold text-gray-900">Declared Holidays</h3>
            </div>
            {loading ? (
              <div className="p-12 flex justify-center">
                <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
              </div>
            ) : holidays.length === 0 ? (
              <div className="p-12 text-center text-gray-500 flex flex-col items-center">
                <CalendarIcon className="w-12 h-12 text-gray-300 mb-4" />
                <p className="text-lg font-medium text-gray-900">No holidays declared</p>
                <p className="text-sm text-gray-500 mt-1">Click sync or add one manually.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {holidays.map((holiday) => (
                  <div key={holiday.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="bg-indigo-50 p-2.5 rounded-xl">
                        <CalendarIcon className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{holiday.name}</p>
                        <p className="text-xs text-gray-500">{format(new Date(holiday.date), 'MMMM dd, yyyy')}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        holiday.type === 'regular' 
                          ? 'bg-red-100 text-red-700' 
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {holiday.type === 'regular' ? 'Regular' : 'Special'}
                      </span>
                      <button
                        onClick={() => handleDeleteHoliday(holiday.id)}
                        className="text-gray-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
