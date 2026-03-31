import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  CreditCard, 
  Loader2, 
  Box, 
  CheckCircle2, 
  FileText, 
  DollarSign, 
  Lock,
  Search,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

interface Container {
  id: string;
  visual_code: string;
  kar_code: string | null;
  type: 'local' | 'foreign';
  status: string;
  platform_number: number | null;
  created_at: string;
  updated_at: string;
}

export function Billing() {
  const [loading, setLoading] = useState(true);
  const [containers, setContainers] = useState<Container[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'BILLING' | 'BILLED' | 'ALL'>('BILLING');

  useEffect(() => {
    fetchContainers();
    
    const channel = supabase
      .channel('billing_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'containers' }, () => {
        fetchContainers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchContainers() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('containers')
        .select('*')
        .in('status', ['BILLING', 'BILLED'])
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setContainers(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkAsBilled(containerId: string) {
    try {
      const { error } = await supabase
        .from('containers')
        .update({ status: 'BILLED' })
        .eq('id', containerId);

      if (error) throw error;
      setSuccess("Container marked as BILLED and locked.");
      fetchContainers();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const filteredContainers = containers.filter(c => {
    const matchesSearch = (c.kar_code?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          c.visual_code.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesFilter = filter === 'ALL' || c.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Billing Module (Finance)</h2>
          <p className="mt-1 text-base text-gray-500">Manage invoices and final billing for containers.</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center shadow-sm">
          <CheckCircle2 className="w-5 h-5 mr-2 rotate-45" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            <CheckCircle2 className="w-4 h-4 rotate-45" />
          </button>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex items-center shadow-sm">
          <CheckCircle2 className="w-5 h-5 mr-2" />
          {success}
          <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-500 hover:text-emerald-700">
            <CheckCircle2 className="w-4 h-4 rotate-45" />
          </button>
        </div>
      )}

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search KAR or Visual Code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
          />
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto">
          {(['BILLING', 'BILLED', 'ALL'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                filter === f 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Billing List */}
      <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
          </div>
        ) : filteredContainers.length === 0 ? (
          <div className="p-12 text-center text-gray-500 flex flex-col items-center">
            <CreditCard className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-lg font-medium text-gray-900">No billing records found</p>
            <p className="text-sm text-gray-500 mt-1">Containers will appear here once sent to billing.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Container Info</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date Sent</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredContainers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="bg-indigo-50 p-2 rounded-lg mr-3">
                          <Box className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900">{c.kar_code || c.visual_code}</div>
                          {c.kar_code && (
                            <div className="text-xs text-gray-500">Visual: {c.visual_code}</div>
                          )}
                          <div className="text-[10px] text-gray-400 uppercase font-bold mt-1">{c.type}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        c.status === 'BILLED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(new Date(c.updated_at), 'MMM dd, yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        {c.status === 'BILLING' ? (
                          <>
                            <button className="inline-flex items-center px-3 py-1.5 border border-gray-200 text-xs font-bold rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-all">
                              <DollarSign className="w-3.5 h-3.5 mr-1" />
                              Compute
                            </button>
                            <button className="inline-flex items-center px-3 py-1.5 border border-gray-200 text-xs font-bold rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-all">
                              <FileText className="w-3.5 h-3.5 mr-1" />
                              Invoice
                            </button>
                            <button 
                              onClick={() => handleMarkAsBilled(c.id)}
                              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-bold rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 transition-all"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Mark Billed
                            </button>
                          </>
                        ) : (
                          <div className="inline-flex items-center px-3 py-1.5 text-xs font-bold text-gray-400 bg-gray-50 rounded-lg border border-gray-100">
                            <Lock className="w-3.5 h-3.5 mr-1" />
                            LOCKED
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
