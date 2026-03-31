import React, { useState, useEffect, useRef } from 'react';
import { supabase, verifyConnection } from '../lib/supabase';
import { Loader2, Trash2, Database, AlertTriangle, CheckCircle2, AlertCircle, Bug, Terminal, XCircle, RefreshCw, Download, Box } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { exportToCSV } from '../lib/export';

interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'error' | 'warn' | 'info' | 'log';
  message: string;
  stack?: string;
}

export function Admin() {
  const [generatingData, setGeneratingData] = useState(false);
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [clearingData, setClearingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Debugging state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isDebugging, setIsDebugging] = useState(false);
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [dbError, setDbError] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Intercept console methods
  useEffect(() => {
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const originalConsoleLog = console.log;
    const originalConsoleInfo = console.info;

    const addLog = (type: LogEntry['type'], args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? (arg instanceof Error ? arg.message : JSON.stringify(arg, null, 2)) : String(arg)
      ).join(' ');
      
      const stack = args.find(arg => arg instanceof Error)?.stack;

      setLogs(prev => [...prev, {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date(),
        type,
        message,
        stack
      }]);
    };

    console.error = (...args) => {
      addLog('error', args);
      originalConsoleError.apply(console, args);
    };

    console.warn = (...args) => {
      addLog('warn', args);
      originalConsoleWarn.apply(console, args);
    };

    console.log = (...args) => {
      addLog('log', args);
      originalConsoleLog.apply(console, args);
    };

    console.info = (...args) => {
      addLog('info', args);
      originalConsoleInfo.apply(console, args);
    };

    // Global error handler
    const handleWindowError = (event: ErrorEvent) => {
      addLog('error', [event.error || new Error(event.message)]);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      addLog('error', ['Unhandled Promise Rejection:', event.reason]);
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      console.log = originalConsoleLog;
      console.info = originalConsoleInfo;
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (isDebugging && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isDebugging]);

  // Check DB connection
  const checkDbConnection = async () => {
    setDbStatus('checking');
    setDbError(null);
    const { connected, error } = await verifyConnection();
    if (connected) {
      setDbStatus('connected');
      console.log('Database connection successful and secured');
    } else {
      setDbStatus('error');
      setDbError(error);
      console.error('Database connection failed:', error);
    }
  };

  const runDataIntegrityCheck = async () => {
    console.info('Starting Data Integrity Check...');
    let issuesFound = 0;

    try {
      // 1. Check for orphaned attendance records
      console.log('Checking for orphaned attendance records...');
      const { data: attendance, error: attError } = await supabase.from('attendance').select('id, employee_id');
      if (attError) throw attError;

      const { data: employees, error: empError } = await supabase.from('employees').select('id');
      if (empError) throw empError;

      const empIds = new Set(employees.map(e => e.id));
      const orphanedAttendance = attendance?.filter(a => !empIds.has(a.employee_id)) || [];

      if (orphanedAttendance.length > 0) {
        console.warn(`Found ${orphanedAttendance.length} orphaned attendance records!`);
        issuesFound += orphanedAttendance.length;
      } else {
        console.log('No orphaned attendance records found.');
      }

      // 2. Check for inconsistent attendance times
      console.log('Checking for inconsistent attendance times...');
      const { data: timeIssues, error: timeError } = await supabase
        .from('attendance')
        .select('id, time_in, time_out')
        .not('time_in', 'is', null)
        .not('time_out', 'is', null);
      
      if (timeError) throw timeError;

      const inconsistentTimes = timeIssues?.filter(a => new Date(a.time_out!) < new Date(a.time_in!)) || [];
      if (inconsistentTimes.length > 0) {
        console.warn(`Found ${inconsistentTimes.length} records with time_out before time_in!`);
        issuesFound += inconsistentTimes.length;
      } else {
        console.log('No inconsistent attendance times found.');
      }

      if (issuesFound === 0) {
        console.log('Data integrity check passed: No major issues found.');
        setSuccess('Data integrity check passed!');
      } else {
        console.error(`Data integrity check failed: ${issuesFound} issues found.`);
        setError(`Data integrity check failed with ${issuesFound} issues.`);
      }
    } catch (err: any) {
      console.error('Data integrity check error:', err);
      setError('Data integrity check failed to complete.');
    }
  };

  useEffect(() => {
    if (isDebugging) {
      checkDbConnection();
    }
  }, [isDebugging]);

  const runSelfTest = async () => {
    console.log('Starting self-diagnostic test...');
    
    // Test 1: Env Vars
    console.info('Test 1: Checking environment variables...');
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      console.error('Missing Supabase environment variables!');
    } else {
      console.log('Environment variables present.');
    }

    // Test 2: DB Connection
    console.info('Test 2: Testing database connection...');
    await checkDbConnection();

    // Test 3: Data Integrity
    await runDataIntegrityCheck();

    // Test 4: Table Access
    console.info('Test 4: Checking table access permissions...');
    const tables = ['employees', 'attendance', 'cash_advances', 'holidays', 'containers'];
    for (const table of tables) {
      try {
        const { error } = await supabase.from(table).select('id').limit(1);
        if (error) {
          console.error(`Error accessing table '${table}':`, error.message);
        } else {
          console.log(`Successfully accessed table '${table}'.`);
        }
      } catch (err: any) {
        console.error(`Exception accessing table '${table}':`, err);
      }
    }

    console.log('Self-diagnostic test complete.');
  };

  async function generateTestData() {
    try {
      setGeneratingData(true);
      setError(null);
      setSuccess(null);

      // 1. Create Employees
      const emps = [
        { name: 'Juan Dela Cruz', daily_rate: 600 },
        { name: 'Maria Santos', daily_rate: 500 },
        { name: 'Pedro Penduko', daily_rate: 550 },
        { name: 'Ana Reyes', daily_rate: 650 }
      ];
      
      const { data: insertedEmps, error: empError } = await supabase
        .from('employees')
        .insert(emps)
        .select();
        
      if (empError) throw empError;
      
      // 2. Create Attendance & CA
      const today = new Date();
      const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
      const twoDaysAgo = new Date(today); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      
      const formatDate = (d: Date) => d.toISOString().split('T')[0];
      
      const attendanceRecords = [];
      const caRecords = [];
      
      // Juan (Index 0): Normal 2 days ago, OT yesterday, Timed in today. CA 2 days ago.
      if (insertedEmps && insertedEmps[0]) {
        const id = insertedEmps[0].id;
        attendanceRecords.push({ employee_id: id, date: formatDate(twoDaysAgo), time_in: `${formatDate(twoDaysAgo)}T07:00:00`, time_out: `${formatDate(twoDaysAgo)}T16:00:00`, status: 'present' });
        attendanceRecords.push({ employee_id: id, date: formatDate(yesterday), time_in: `${formatDate(yesterday)}T07:00:00`, time_out: `${formatDate(yesterday)}T18:00:00`, status: 'present' });
        attendanceRecords.push({ employee_id: id, date: formatDate(today), time_in: `${formatDate(today)}T06:50:00`, status: 'present' });
        caRecords.push({ employee_id: id, amount: 500, date: formatDate(twoDaysAgo) });
      }
      
      // Maria (Index 1): Normal 2 days ago, Undertime yesterday, Timed in today.
      if (insertedEmps && insertedEmps[1]) {
        const id = insertedEmps[1].id;
        attendanceRecords.push({ employee_id: id, date: formatDate(twoDaysAgo), time_in: `${formatDate(twoDaysAgo)}T06:55:00`, time_out: `${formatDate(twoDaysAgo)}T16:05:00`, status: 'present' });
        attendanceRecords.push({ employee_id: id, date: formatDate(yesterday), time_in: `${formatDate(yesterday)}T07:00:00`, time_out: `${formatDate(yesterday)}T12:00:00`, status: 'present' });
        attendanceRecords.push({ employee_id: id, date: formatDate(today), time_in: `${formatDate(today)}T07:05:00`, status: 'present' });
      }

      // Pedro (Index 2): Normal 2 days ago, Normal yesterday, Absent today. CA yesterday.
      if (insertedEmps && insertedEmps[2]) {
        const id = insertedEmps[2].id;
        attendanceRecords.push({ employee_id: id, date: formatDate(twoDaysAgo), time_in: `${formatDate(twoDaysAgo)}T07:10:00`, time_out: `${formatDate(twoDaysAgo)}T16:00:00`, status: 'present' });
        attendanceRecords.push({ employee_id: id, date: formatDate(yesterday), time_in: `${formatDate(yesterday)}T07:00:00`, time_out: `${formatDate(yesterday)}T16:00:00`, status: 'present' });
        caRecords.push({ employee_id: id, amount: 200, date: formatDate(yesterday) });
      }

      // Ana (Index 3): Absent 2 days ago, Normal yesterday, Timed in today.
      if (insertedEmps && insertedEmps[3]) {
        const id = insertedEmps[3].id;
        attendanceRecords.push({ employee_id: id, date: formatDate(yesterday), time_in: `${formatDate(yesterday)}T07:00:00`, time_out: `${formatDate(yesterday)}T16:00:00`, status: 'present' });
        attendanceRecords.push({ employee_id: id, date: formatDate(today), time_in: `${formatDate(today)}T06:58:00`, status: 'present' });
      }

      if (attendanceRecords.length > 0) {
        await supabase.from('attendance').insert(attendanceRecords);
      }
      if (caRecords.length > 0) {
        await supabase.from('cash_advances').insert(caRecords);
      }

      // 3. Create Holidays
      const holidays = [
        { date: formatDate(new Date(today.getFullYear(), 0, 1)), name: 'New Year\'s Day', type: 'regular' },
        { date: formatDate(new Date(today.getFullYear(), 11, 25)), name: 'Christmas Day', type: 'regular' },
        { date: formatDate(new Date(today.getFullYear(), 11, 30)), name: 'Rizal Day', type: 'regular' }
      ];
      await supabase.from('holidays').insert(holidays);

      // 4. Create Containers
      const containers = [
        { visual_code: 'VC-101', type: 'local', status: 'PLACED', platform_number: 1 },
        { visual_code: 'VC-202', type: 'foreign', status: 'REPAIR', platform_number: 2 },
        { visual_code: 'VC-303', kar_code: 'KAR-303', type: 'local', status: 'FINAL INSPECT', platform_number: 3 },
        { visual_code: 'VC-404', kar_code: 'KAR-404', type: 'foreign', status: 'BILLING', platform_number: null },
        { visual_code: 'VC-505', kar_code: 'KAR-505', type: 'local', status: 'BILLED', platform_number: null }
      ];
      await supabase.from('containers').insert(containers);

      setSuccess('Sample data generated successfully!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGeneratingData(false);
    }
  }

  async function clearAllData() {
    try {
      setClearingData(true);
      setError(null);
      setSuccess(null);
      
      // Delete all records. Since we have ON DELETE CASCADE, deleting employees might be enough,
      // but we delete from all tables explicitly to be safe.
      await supabase.from('attendance').delete().not('id', 'is', null);
      await supabase.from('cash_advances').delete().not('id', 'is', null);
      await supabase.from('holidays').delete().not('id', 'is', null);
      await supabase.from('containers').delete().not('id', 'is', null);
      await supabase.from('employees').delete().not('id', 'is', null);
      
      setClearModalOpen(false);
      setSuccess('All data has been cleared successfully.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setClearingData(false);
    }
  }

  function handleExportLogs() {
    const exportData = logs.map(log => ({
      Timestamp: log.timestamp.toISOString(),
      Type: log.type,
      Message: log.message,
      Stack: log.stack || ''
    }));
    exportToCSV(exportData, 'system_logs_export');
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto space-y-8"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Admin Panel</h2>
          <p className="mt-2 text-base text-gray-500 leading-relaxed">Manage system data and settings.</p>
        </div>
        <button
          onClick={handleExportLogs}
          className="inline-flex justify-center items-center px-4 py-2.5 border border-gray-200 text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 transition-colors"
        >
          <Download className="w-5 h-5 mr-2" />
          Export Logs
        </button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center"
          >
            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </motion.div>
        )}

        {success && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center"
          >
            <CheckCircle2 className="h-5 w-5 mr-2 flex-shrink-0" />
            <p className="text-sm">{success}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-6 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Database className="h-5 w-5 mr-2 text-indigo-600" />
            Data Management
          </h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <motion.div 
              whileHover={{ scale: 1.02 }}
              className="border border-gray-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-6 bg-white shadow-sm hover:shadow-md transition-all"
            >
              <div className="p-4 bg-indigo-50 rounded-full">
                <Database className="h-10 w-10 text-indigo-600" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-gray-900">Load Sample Data</h4>
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">Populate the database with test employees, attendance, and cash advances for testing.</p>
              </div>
              <button
                onClick={generateTestData}
                disabled={generatingData || clearingData}
                className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 w-full justify-center transition-colors"
              >
                {generatingData ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <Database className="h-5 w-5 mr-2" />}
                Load Sample Data
              </button>
            </motion.div>

            <motion.div 
              whileHover={{ scale: 1.02 }}
              className="border border-red-100 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-6 bg-red-50/30 shadow-sm hover:shadow-md transition-all"
            >
              <div className="p-4 bg-red-100 rounded-full">
                <Trash2 className="h-10 w-10 text-red-600" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-gray-900">Clear All Data</h4>
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">Permanently delete all employees, attendance records, and cash advances. Cannot be undone.</p>
              </div>
              <button
                onClick={() => setClearModalOpen(true)}
                disabled={generatingData || clearingData}
                className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 w-full justify-center transition-colors"
              >
                {clearingData ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <Trash2 className="h-5 w-5 mr-2" />}
                Clear All Data
              </button>
            </motion.div>
          </div>
        </div>
      </div>

      {/* SQL Schema Section */}
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <Database className="w-6 h-6 text-indigo-600" />
          <h3 className="text-xl font-bold text-gray-900">Database Schema</h3>
        </div>
        
        <div className="grid grid-cols-1 gap-6">
          {/* Containers Table */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="bg-indigo-100 p-2 rounded-lg">
                  <Box className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Containers Table</h3>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Required for the Projects and Billing modules.
            </p>
            <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto">
              <pre className="text-xs text-indigo-300 font-mono">
{`CREATE TABLE IF NOT EXISTS containers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visual_code TEXT NOT NULL,
  kar_code TEXT UNIQUE,
  type TEXT CHECK (type IN ('local', 'foreign')) NOT NULL,
  status TEXT NOT NULL,
  platform_number INTEGER CHECK (platform_number BETWEEN 1 AND 6),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE containers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable all access for all users" ON containers FOR ALL USING (true);`}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Debugging Panel */}
      <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Bug className="h-5 w-5 mr-2 text-indigo-600" />
            System Diagnostics
          </h3>
          <button
            onClick={() => setIsDebugging(!isDebugging)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              isDebugging 
                ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' 
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {isDebugging ? 'Hide Debug Console' : 'Show Debug Console'}
          </button>
        </div>
        
        <AnimatePresence>
          {isDebugging && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 bg-gray-50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center">
                      <span className="text-sm font-medium text-gray-700 mr-2">Database Status:</span>
                      {dbStatus === 'checking' && <Loader2 className="h-4 w-4 text-indigo-500 animate-spin" />}
                      {dbStatus === 'connected' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" /> Connected</span>}
                      {dbStatus === 'error' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" /> Error</span>}
                    </div>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => setLogs([])}
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Clear Logs
                    </button>
                    <button
                      onClick={runSelfTest}
                      className="inline-flex items-center px-3 py-1.5 border border-transparent shadow-sm text-xs font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      Run Self-Test
                    </button>
                  </div>
                </div>
                {dbError && (
                  <div className="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
                    {dbError}
                  </div>
                )}
              </div>
              
              <div className="bg-gray-900 p-4 h-96 overflow-y-auto font-mono text-sm">
                {logs.length === 0 ? (
                  <div className="text-gray-500 h-full flex flex-col items-center justify-center">
                    <Terminal className="h-8 w-8 mb-2 opacity-50" />
                    <p>No logs recorded yet.</p>
                    <p className="text-xs mt-1">Run a self-test or interact with the app to see logs.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <div key={log.id} className="border-b border-gray-800 pb-2 last:border-0">
                        <div className="flex items-start">
                          <span className="text-gray-500 text-xs mr-3 mt-0.5 whitespace-nowrap">
                            {log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
                          </span>
                          <span className={`font-semibold mr-2 uppercase text-xs mt-0.5 ${
                            log.type === 'error' ? 'text-red-400' :
                            log.type === 'warn' ? 'text-yellow-400' :
                            log.type === 'info' ? 'text-blue-400' :
                            'text-green-400'
                          }`}>
                            [{log.type}]
                          </span>
                          <span className={`break-all ${
                            log.type === 'error' ? 'text-red-300' :
                            log.type === 'warn' ? 'text-yellow-300' :
                            'text-gray-300'
                          }`}>
                            {log.message}
                          </span>
                        </div>
                        {log.stack && (
                          <pre className="mt-1 ml-16 text-xs text-gray-500 overflow-x-auto p-2 bg-gray-950 rounded">
                            {log.stack}
                          </pre>
                        )}
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Clear Data Confirmation Modal */}
      <AnimatePresence>
        {clearModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm" 
              onClick={() => setClearModalOpen(false)} 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 relative z-50 border border-gray-100"
            >
              <div className="flex items-center justify-center w-16 h-16 mx-auto bg-red-50 rounded-full mb-6 border border-red-100">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
              <h3 className="text-xl font-semibold text-center text-gray-900 mb-3">Clear All Data</h3>
              <p className="text-base text-center text-gray-500 mb-8 leading-relaxed">
                Are you sure you want to delete all employees, attendance records, and cash advances? <span className="font-semibold text-gray-700">This action cannot be undone.</span>
              </p>
              <div className="flex justify-center space-x-4">
                <button
                  onClick={() => setClearModalOpen(false)}
                  disabled={clearingData}
                  className="px-6 py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={clearAllData}
                  disabled={clearingData}
                  className="inline-flex items-center px-6 py-3 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 transition-colors"
                >
                  {clearingData ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Yes, Clear All
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
