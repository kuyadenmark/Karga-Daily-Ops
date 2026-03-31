import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Trash2, Plus, Banknote, FileText, AlertCircle, Download } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'motion/react';
import { exportToCSV } from '../lib/export';

interface Employee {
  id: string;
  name: string;
}

interface CashAdvanceRecord {
  id: string;
  employee_id: string;
  amount: number;
  date: string;
}

export function CashAdvance() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [advances, setAdvances] = useState<CashAdvanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [dbError, setDbError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  function handleExport() {
    const exportData = advances.map(ca => {
      const emp = employees.find(e => e.id === ca.employee_id);
      return {
        Employee: emp?.name || 'Unknown',
        Amount: ca.amount,
        Date: ca.date
      };
    });
    exportToCSV(exportData, 'cash_advances_export');
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      const { data: empData, error: empError } = await supabase
        .from('employees')
        .select('id, name')
        .order('name');

      if (empError) throw empError;
      setEmployees(empData || []);

      const { data: caData, error: caError } = await supabase
        .from('cash_advances')
        .select('*')
        .order('date', { ascending: false });

      if (caError) {
        if (caError.message.includes('does not exist')) {
          setDbError(true);
          return;
        }
        throw caError;
      }
      setAdvances(caData || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEmployee || !amount || !date) return;

    try {
      setSaving(true);
      setError(null);
      const { error } = await supabase
        .from('cash_advances')
        .insert([{ employee_id: selectedEmployee, amount: parseFloat(amount), date }]);

      if (error) throw error;

      setAmount('');
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      setDeleteLoading(id);
      setError(null);
      const { error } = await supabase.from('cash_advances').delete().eq('id', id);
      if (error) throw error;
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleteLoading(null);
    }
  }

  if (dbError) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto space-y-8"
      >
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-red-200">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-3 bg-red-100 rounded-xl">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-900">Database Update Required</h2>
          </div>
          <p className="text-gray-600 mb-4 leading-relaxed">
            To use the Cash Advance feature, you need to create the <code className="bg-gray-100 px-2 py-1 rounded text-gray-800 font-mono text-sm">cash_advances</code> table in your Supabase database.
          </p>
          <p className="text-gray-600 mb-4 leading-relaxed">
            Go to your Supabase Dashboard &gt; SQL Editor, and run the following query:
          </p>
          <pre className="bg-gray-900 text-green-400 p-6 rounded-xl overflow-x-auto text-sm mb-8 font-mono shadow-inner">
{`CREATE TABLE IF NOT EXISTS cash_advances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);`}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-xl shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            I have run the SQL query
          </button>
        </div>
      </motion.div>
    );
  }

  const getEmployeeName = (id: string) => {
    const emp = employees.find(e => e.id === id);
    return emp ? emp.name : 'Unknown Employee';
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto space-y-8"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Cash Advances</h2>
          <p className="mt-2 text-base text-gray-500 leading-relaxed">Manage employee cash advances and deductions.</p>
        </div>
        <button
          onClick={handleExport}
          className="inline-flex justify-center items-center px-4 py-2.5 border border-gray-200 text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 transition-colors"
        >
          <Download className="w-5 h-5 mr-2" />
          Export
        </button>
      </div>

      {error && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center"
        >
          <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </motion.div>
      )}

      {/* Add CA Form */}
      <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-6 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Banknote className="h-5 w-5 mr-2 text-indigo-600" />
            Issue Cash Advance
          </h3>
        </div>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-0 sm:flex sm:items-end sm:space-x-4">
            <div className="w-full sm:flex-1">
              <label htmlFor="employee" className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
              <select
                id="employee"
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                required
                className="block w-full border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-3 border bg-white transition-colors"
              >
                <option value="">Select Employee</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-48">
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">₱</span>
                </div>
                <input
                  type="number"
                  id="amount"
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-8 sm:text-sm border-gray-300 rounded-xl p-3 border transition-colors"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  step="0.01"
                  min="1"
                  required
                />
              </div>
            </div>
            <div className="w-full sm:w-48">
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                id="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="block w-full border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-3 border transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={saving || employees.length === 0}
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Issue Advance
            </button>
          </form>
        </div>
      </div>

      {/* CA List */}
      <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h3 className="text-lg font-medium text-gray-900">Recent Cash Advances</h3>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
            {advances.length} Records
          </span>
        </div>
        
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-gray-500">
            <Loader2 className="animate-spin h-8 w-8 text-indigo-600 mb-4" />
            <p className="text-sm font-medium">Loading records...</p>
          </div>
        ) : advances.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="bg-gray-50 p-4 rounded-full mb-4">
              <FileText className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No cash advances</h3>
            <p className="text-gray-500 max-w-sm">There are no cash advance records to display. Issue a new cash advance above to get started.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {advances.map((ca, index) => (
              <motion.li 
                key={ca.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="hover:bg-gray-50 transition-colors"
              >
                <div className="px-6 py-5 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
                      <Banknote className="h-6 w-6 text-indigo-600" />
                    </div>
                    <div className="ml-4">
                      <div className="text-base font-medium text-gray-900">{getEmployeeName(ca.employee_id)}</div>
                      <div className="text-sm text-gray-500 mt-0.5 flex items-center">
                        {format(new Date(ca.date), 'MMMM d, yyyy')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-6">
                    <div className="text-right">
                      <span className="inline-flex items-center px-3 py-1 rounded-lg text-sm font-semibold bg-red-50 text-red-700 border border-red-100">
                        ₱ {Number(ca.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDelete(ca.id)}
                      disabled={deleteLoading === ca.id}
                      className="text-gray-400 hover:text-red-600 p-2 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="Delete Record"
                    >
                      {deleteLoading === ca.id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Trash2 className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
}
