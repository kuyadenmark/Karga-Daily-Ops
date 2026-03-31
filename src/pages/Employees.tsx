import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Loader2, Trash2, Banknote, X, Pencil, Download } from 'lucide-react';
import { motion } from 'motion/react';
import { exportToCSV } from '../lib/export';

interface Employee {
  id: string;
  name: string;
  daily_rate: number;
  skills?: string[];
}

export function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [name, setName] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [skillsInput, setSkillsInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Cash Advance State
  const [dbError, setDbError] = useState(false);
  const [caModalOpen, setCaModalOpen] = useState(false);
  const [activeEmployee, setActiveEmployee] = useState<Employee | null>(null);
  const [caHistory, setCaHistory] = useState<any[]>([]);
  const [caAmount, setCaAmount] = useState('');
  const [caDate, setCaDate] = useState(new Date().toISOString().split('T')[0]);
  const [caLoading, setCaLoading] = useState(false);

  useEffect(() => {
    fetchEmployees();
  }, []);

  async function fetchEmployees() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, daily_rate, skills')
        .order('name', { ascending: true });

      if (error) throw error;
      setEmployees(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleExport() {
    const exportData = employees.map(emp => ({
      Name: emp.name,
      DailyRate: emp.daily_rate,
      Skills: emp.skills?.join(', ') || ''
    }));
    exportToCSV(exportData, 'employees_export');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !dailyRate) return;

    try {
      setSaving(true);
      setError(null);
      
      const skillsArray = skillsInput
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      if (editingEmployee) {
        const { error } = await supabase
          .from('employees')
          .update({ name, daily_rate: parseFloat(dailyRate), skills: skillsArray })
          .eq('id', editingEmployee.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('employees')
          .insert([{ name, daily_rate: parseFloat(dailyRate), skills: skillsArray }]);
        if (error) throw error;
      }

      setName('');
      setDailyRate('');
      setSkillsInput('');
      setEditingEmployee(null);
      await fetchEmployees();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(employee: Employee) {
    setEditingEmployee(employee);
    setName(employee.name);
    setDailyRate(employee.daily_rate.toString());
    setSkillsInput(employee.skills?.join(', ') || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete(id: string) {
    try {
      setDeleteLoading(id);
      setError(null);
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchEmployees();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleteLoading(null);
    }
  }

  async function openCAModal(emp: Employee) {
    setActiveEmployee(emp);
    setCaModalOpen(true);
    fetchCAHistory(emp.id);
  }

  async function fetchCAHistory(empId: string) {
    try {
      const { data, error } = await supabase
        .from('cash_advances')
        .select('*')
        .eq('employee_id', empId)
        .order('date', { ascending: false });

      if (error) {
        if (error.message.includes('does not exist')) {
          setDbError(true);
          setCaModalOpen(false);
          return;
        }
        throw error;
      }
      setCaHistory(data || []);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleAddCA(e: React.FormEvent) {
    e.preventDefault();
    if (!activeEmployee || !caAmount || !caDate) return;
    try {
      setCaLoading(true);
      const { error } = await supabase
        .from('cash_advances')
        .insert([{ employee_id: activeEmployee.id, amount: parseFloat(caAmount), date: caDate }]);
      if (error) throw error;
      setCaAmount('');
      fetchCAHistory(activeEmployee.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCaLoading(false);
    }
  }
  
  async function handleDeleteCA(id: string) {
    try {
      const { error } = await supabase.from('cash_advances').delete().eq('id', id);
      if (error) throw error;
      if (activeEmployee) fetchCAHistory(activeEmployee.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (dbError) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="bg-white p-8 rounded-lg shadow-md border border-red-200">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Database Update Required</h2>
          <p className="text-gray-700 mb-4">
            To use the Cash Advance feature, you need to create the <code>cash_advances</code> table in your Supabase database.
          </p>
          <p className="text-gray-700 mb-4">
            Go to your Supabase Dashboard &gt; SQL Editor, and run the following query:
          </p>
          <pre className="bg-gray-900 text-green-400 p-4 rounded-md overflow-x-auto text-sm mb-6">
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
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            I have run the SQL query
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-7xl mx-auto space-y-6"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 leading-relaxed">Employee Management</h2>
          <p className="mt-1 text-sm text-gray-500 leading-relaxed">Add and manage employees in your organization.</p>
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
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Add Employee Form */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-2xl">
        <div className="p-6">
          <h3 className="text-lg font-medium text-gray-900 leading-relaxed">
            {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
          </h3>
          <form onSubmit={handleSubmit} className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-4">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Employee Name</label>
              <input
                type="text"
                name="name"
                id="name"
                className="focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-200 rounded-xl p-3 border"
                placeholder="Juan Dela Cruz"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="md:col-span-3">
              <label htmlFor="skills" className="block text-sm font-medium text-gray-700 mb-1">Skills</label>
              <input
                type="text"
                name="skills"
                id="skills"
                className="focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-200 rounded-xl p-3 border"
                placeholder="Enter skills (comma separated)"
                value={skillsInput}
                onChange={(e) => setSkillsInput(e.target.value)}
              />
            </div>
            <div className="md:col-span-3">
              <label htmlFor="dailyRate" className="block text-sm font-medium text-gray-700 mb-1">Daily Rate</label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">₱</span>
                </div>
                <input
                  type="number"
                  name="dailyRate"
                  id="dailyRate"
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-8 sm:text-sm border-gray-200 rounded-xl p-3 border"
                  placeholder="0.00"
                  value={dailyRate}
                  onChange={(e) => setDailyRate(e.target.value)}
                  step="0.01"
                  min="0"
                  required
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent font-medium rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm disabled:opacity-50 transition-colors gap-2"
              >
                {saving ? <Loader2 className="animate-spin h-5 w-5" /> : (editingEmployee ? 'Update' : 'Add')}
              </button>
              {editingEmployee && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingEmployee(null);
                    setName('');
                    setDailyRate('');
                    setSkillsInput('');
                  }}
                  className="w-full mt-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Employee List */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <input
            type="text"
            placeholder="Search employees..."
            className="focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-200 rounded-xl p-3 border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
          </div>
        ) : employees.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No employees found. Add one above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Skills</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Daily Rate</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {employees
                  .filter(emp => emp.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((employee) => (
                  <tr key={employee.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                          <span className="text-indigo-600 font-medium text-lg">
                            {employee.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {employee.skills && Array.isArray(employee.skills) && employee.skills.length > 0 ? (
                        <span className="text-sm text-gray-600">
                          {employee.skills.join(', ')}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400 italic">No skills</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        ₱ {employee.daily_rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / day
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => openCAModal(employee)}
                          className="text-indigo-600 hover:text-indigo-900 p-2 rounded-lg hover:bg-indigo-50 transition-colors"
                          title="Cash Advance"
                        >
                          <Banknote className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => startEdit(employee)}
                          className="text-blue-600 hover:text-blue-900 p-2 rounded-lg hover:bg-blue-50 transition-colors"
                          title="Edit Employee"
                        >
                          <Pencil className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(employee.id)}
                          disabled={deleteLoading === employee.id}
                          className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                          title="Delete Employee"
                        >
                          {deleteLoading === employee.id ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Trash2 className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cash Advance Modal */}
      {caModalOpen && activeEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Cash Advances: {activeEmployee.name}</h3>
              <button onClick={() => setCaModalOpen(false)} className="text-gray-400 hover:text-gray-500 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
              <form onSubmit={handleAddCA} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₱)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    value={caAmount}
                    onChange={(e) => setCaAmount(e.target.value)}
                    className="block w-full border-gray-200 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-3 border"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={caDate}
                    onChange={(e) => setCaDate(e.target.value)}
                    className="block w-full border-gray-200 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-3 border"
                  />
                </div>
                <button
                  type="submit"
                  disabled={caLoading}
                  className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
                >
                  {caLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                  Add Cash Advance
                </button>
              </form>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <h4 className="text-sm font-medium text-gray-900 mb-4">History</h4>
              {caHistory.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No cash advances found.</p>
              ) : (
                <ul className="space-y-3">
                  {caHistory.map((ca) => (
                    <li key={ca.id} className="flex justify-between items-center bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                      <div>
                        <p className="text-sm font-bold text-gray-900">₱ {Number(ca.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p className="text-xs text-gray-500 mt-1">{new Date(ca.date).toLocaleDateString()}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteCA(ca.id)}
                        className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
