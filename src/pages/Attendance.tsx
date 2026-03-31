import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, LogIn, LogOut, Trash2, CheckSquare, Square, Clock, Calendar as CalendarIcon, X, User, Download } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'motion/react';
import { exportToCSV } from '../lib/export';

interface Employee {
  id: string;
  name: string;
}

interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: string;
  time_in: string | null;
  time_out: string | null;
  status: string;
}

export function Attendance() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceRecord>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Bulk selection & manual time state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [manualTime, setManualTime] = useState('');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'absent'>('all');
  const [currentHoliday, setCurrentHoliday] = useState<any>(null);

  function handleExport() {
    const exportData = filteredEmployees.map(emp => {
      const record = attendance[emp.id];
      return {
        Employee: emp.name,
        Date: selectedDate,
        TimeIn: record?.time_in ? format(new Date(record.time_in), 'hh:mm a') : 'N/A',
        TimeOut: record?.time_out ? format(new Date(record.time_out), 'hh:mm a') : 'N/A',
        Status: record?.time_in ? 'Present' : 'Absent'
      };
    });
    exportToCSV(exportData, `attendance_${selectedDate}_${statusFilter}`);
  }

  useEffect(() => {
    fetchData();
    setSelectedIds([]);
    setManualTime('');

    // Set up real-time subscription
    const channel = supabase
      .channel('attendance_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance',
          filter: `date=eq.${selectedDate}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newRecord = payload.new as AttendanceRecord;
            setAttendance(prev => ({ ...prev, [newRecord.employee_id]: newRecord }));
          } else if (payload.eventType === 'UPDATE') {
            const updatedRecord = payload.new as AttendanceRecord;
            setAttendance(prev => ({ ...prev, [updatedRecord.employee_id]: updatedRecord }));
          } else if (payload.eventType === 'DELETE') {
            const deletedRecord = payload.old as AttendanceRecord;
            // We need to find which employee this record belonged to.
            // Since payload.old might only have the ID, we might need to refetch or find it in current state.
            // But usually for DELETE, payload.old contains the primary key.
            // If employee_id is part of the primary key or included in the record, we're good.
            setAttendance(prev => {
              const newState = { ...prev };
              const employeeId = Object.keys(newState).find(key => newState[key].id === deletedRecord.id);
              if (employeeId) {
                delete newState[employeeId];
              }
              return newState;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate, statusFilter]);

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

      const { data: attData, error: attError } = await supabase
        .from('attendance')
        .select('*')
        .eq('date', selectedDate);

      if (attError) throw attError;

      const attMap: Record<string, AttendanceRecord> = {};
      if (attData) {
        attData.forEach((record) => {
          attMap[record.employee_id] = record;
        });
      }
      setAttendance(attMap);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }

    // Fetch holiday for selected date
    const { data: holidayData } = await supabase
      .from('holidays')
      .select('*')
      .eq('date', selectedDate)
      .maybeSingle();
    
    setCurrentHoliday(holidayData);
  }

  const getTimestamp = (isTimeOut = false) => {
    if (selectedDate === format(new Date(), 'yyyy-MM-dd') && !manualTime) {
      return new Date().toISOString();
    }
    
    const [year, month, day] = selectedDate.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    
    if (manualTime) {
      const [hours, minutes] = manualTime.split(':');
      d.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    } else {
      // Default times if manual time is not provided for a past/future date
      d.setHours(isTimeOut ? 17 : 8, 0, 0, 0); // 8 AM for Time In, 5 PM for Time Out
    }
    return d.toISOString();
  };

  async function handleTimeIn(employeeId: string) {
    try {
      setActionLoading(employeeId);
      setError(null);
      const timestamp = getTimestamp(false);

      const { error } = await supabase.from('attendance').insert([{
        employee_id: employeeId,
        date: selectedDate,
        time_in: timestamp,
        status: 'present',
      }]);

      if (error) throw error;
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleTimeOut(employeeId: string, attendanceId: string) {
    try {
      setActionLoading(employeeId);
      setError(null);
      const timestamp = getTimestamp(true);

      const { error } = await supabase.from('attendance').update({ time_out: timestamp }).eq('id', attendanceId);

      if (error) throw error;
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeleteRecord(employeeId: string, attendanceId: string) {
    try {
      setActionLoading(employeeId);
      setError(null);

      const { error } = await supabase.from('attendance').delete().eq('id', attendanceId);

      if (error) throw error;
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleMarkAbsent(employeeId: string, attendanceId?: string) {
    try {
      setActionLoading(employeeId);
      setError(null);
      if (attendanceId) {
        await supabase.from('attendance').update({ status: 'absent', time_in: null, time_out: null }).eq('id', attendanceId);
      } else {
        await supabase.from('attendance').insert([{ employee_id: employeeId, date: selectedDate, status: 'absent' }]);
      }
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleMarkPresent(employeeId: string, attendanceId?: string) {
    try {
      setActionLoading(employeeId);
      setError(null);
      if (attendanceId) {
        await supabase.from('attendance').update({ status: 'present', time_in: getTimestamp(false) }).eq('id', attendanceId);
      } else {
        await supabase.from('attendance').insert([{ employee_id: employeeId, date: selectedDate, status: 'present', time_in: getTimestamp(false) }]);
      }
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleBulkTimeIn() {
    try {
      setBulkLoading(true);
      setError(null);
      const timestamp = getTimestamp(false);
      
      const toInsert = selectedIds
        .filter(id => !attendance[id] || (attendance[id].status !== 'absent' && !attendance[id].time_in))
        .map(id => ({
          employee_id: id,
          date: selectedDate,
          time_in: timestamp,
          status: 'present'
        }));

      if (toInsert.length > 0) {
        const { error } = await supabase.from('attendance').insert(toInsert);
        if (error) throw error;
      }
      
      setSelectedIds([]);
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkTimeOut() {
    try {
      setBulkLoading(true);
      setError(null);
      const timestamp = getTimestamp(true);
      
      const recordsToUpdate = selectedIds
        .map(id => attendance[id])
        .filter(record => record?.time_in && !record?.time_out && record?.status !== 'absent')
        .map(record => record.id);

      if (recordsToUpdate.length > 0) {
        const { error } = await supabase
          .from('attendance')
          .update({ time_out: timestamp })
          .in('id', recordsToUpdate);
        if (error) throw error;
      }
      
      setSelectedIds([]);
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkEditTimeIn() {
    try {
      setBulkLoading(true);
      setError(null);
      const timestamp = getTimestamp(false);
      
      const recordsToUpdate = selectedIds
        .map(id => attendance[id])
        .filter(record => record?.id && record?.status !== 'absent')
        .map(record => record.id);

      if (recordsToUpdate.length > 0) {
        const { error } = await supabase
          .from('attendance')
          .update({ time_in: timestamp })
          .in('id', recordsToUpdate);
        if (error) throw error;
      }
      
      setSelectedIds([]);
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkEditTimeOut() {
    try {
      setBulkLoading(true);
      setError(null);
      const timestamp = getTimestamp(true);
      
      const recordsToUpdate = selectedIds
        .map(id => attendance[id])
        .filter(record => record?.id && record?.status !== 'absent')
        .map(record => record.id);

      if (recordsToUpdate.length > 0) {
        const { error } = await supabase
          .from('attendance')
          .update({ time_out: timestamp })
          .in('id', recordsToUpdate);
        if (error) throw error;
      }
      
      setSelectedIds([]);
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
    }
  }

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const counts = {
    all: employees.length,
    present: employees.filter(e => !!attendance[e.id]?.time_in).length,
    absent: employees.filter(e => !attendance[e.id]?.time_in).length
  };

  const filteredEmployees = employees.filter(e => {
    const matchesSearch = e.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    const record = attendance[e.id];
    const isPresent = !!record?.time_in;
    const isAbsent = !isPresent;

    if (statusFilter === 'present') return isPresent;
    if (statusFilter === 'absent') return isAbsent;
    return true;
  });

  const toggleAll = () => {
    if (selectedIds.length === filteredEmployees.length && filteredEmployees.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredEmployees.map(e => e.id));
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md mx-auto space-y-4 p-4"
    >
      <div className="flex flex-col gap-2">
        <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Daily Attendance</h2>
            <p className="mt-1 text-sm text-gray-500">Manage daily attendance records.</p>
          </div>
          <button
            onClick={handleExport}
            className="inline-flex justify-center items-center px-4 py-2.5 border border-gray-200 text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            <Download className="w-5 h-5 mr-2" />
            Export
          </button>
        </div>
          <p className="mt-1 text-base text-gray-500">
            Manage time in and time out records.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="Search employees..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border px-4 py-2"
          />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border px-4 py-2 cursor-pointer"
          />
            <div className="flex flex-wrap gap-2 mt-1">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${statusFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                All ({counts.all})
              </button>
              <button
                onClick={() => setStatusFilter('present')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${statusFilter === 'present' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Present ({counts.present})
              </button>
              <button
                onClick={() => setStatusFilter('absent')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${statusFilter === 'absent' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Absent ({counts.absent})
              </button>
            </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-sm">
          {error}
        </div>
      )}

      {currentHoliday && (
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className={`border px-4 py-3 rounded-xl flex items-center shadow-sm ${
            currentHoliday.type === 'regular' 
              ? 'bg-red-50 border-red-200 text-red-700' 
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}
        >
          <CalendarIcon className="w-5 h-5 mr-2" />
          <span className="font-bold mr-2">{currentHoliday.name}</span>
          <span className="text-sm opacity-80">
            ({currentHoliday.type === 'regular' ? 'Regular Holiday - Double Pay' : 'Special Non-Working Day - 1.3x Pay'})
          </span>
        </motion.div>
      )}

      <div className="space-y-6">
        {/* Bulk Actions Bar */}
        {!loading && employees.length > 0 && (
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-col gap-2 sticky top-16 md:top-0 z-30">
            <div className="flex items-center justify-between">
              <button 
                onClick={toggleAll}
                className="text-sm font-medium text-gray-700 hover:text-indigo-600 flex items-center transition-colors"
              >
                {selectedIds.length === filteredEmployees.length && filteredEmployees.length > 0 ? <CheckSquare className="w-5 h-5 mr-2 text-indigo-600" /> : <Square className="w-5 h-5 mr-2 text-gray-400" />}
                {selectedIds.length > 0 ? `${selectedIds.length} Selected` : `Select All (${filteredEmployees.length})`}
              </button>
              
              <div className="flex items-center space-x-2">
                <input 
                  type="time" 
                  id="manualTime"
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  className="border-gray-200 rounded-lg shadow-sm text-sm p-2 border focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                  title="Leave empty to use current time"
                />
                {manualTime && (
                  <button onClick={() => setManualTime('')} className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors">Clear</button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleBulkTimeIn}
                disabled={selectedIds.length === 0 || bulkLoading}
                className="flex-1 min-w-[120px] inline-flex justify-center items-center px-3 py-2 text-sm font-medium rounded-xl shadow-sm text-white bg-indigo-500 hover:bg-indigo-600 hover:scale-102 transition-all disabled:opacity-50"
              >
                {bulkLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
                Bulk In
              </button>
              <button
                onClick={handleBulkTimeOut}
                disabled={selectedIds.length === 0 || bulkLoading}
                className="flex-1 min-w-[120px] inline-flex justify-center items-center px-3 py-2 text-sm font-medium rounded-xl shadow-sm text-white bg-orange-400 hover:bg-orange-500 hover:scale-102 transition-all disabled:opacity-50"
              >
                {bulkLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogOut className="w-4 h-4 mr-2" />}
                Bulk Out
              </button>
              <button
                onClick={handleBulkEditTimeIn}
                disabled={selectedIds.length === 0 || bulkLoading}
                className="flex-1 min-w-[120px] inline-flex justify-center items-center px-3 py-2 text-sm font-medium rounded-xl shadow-sm text-gray-700 bg-gray-200 hover:bg-gray-300 hover:scale-102 transition-all disabled:opacity-50"
              >
                {bulkLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
                Edit In
              </button>
              <button
                onClick={handleBulkEditTimeOut}
                disabled={selectedIds.length === 0 || bulkLoading}
                className="flex-1 min-w-[120px] inline-flex justify-center items-center px-3 py-2 text-sm font-medium rounded-xl shadow-sm text-gray-700 bg-gray-200 hover:bg-gray-300 hover:scale-102 transition-all disabled:opacity-50"
              >
                {bulkLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogOut className="w-4 h-4 mr-2" />}
                Edit Out
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-12 flex justify-center bg-white shadow-sm border border-gray-200 rounded-2xl">
            <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
          </div>
        ) : employees.length === 0 ? (
          <div className="p-12 text-center text-gray-500 bg-white shadow-sm border border-gray-200 rounded-2xl flex flex-col items-center">
            <Clock className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-lg font-medium text-gray-900">No employees found</p>
            <p className="text-sm text-gray-500 mt-1">Please add employees first to manage attendance.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredEmployees
              .map((employee, index) => {
                const record = attendance[employee.id];
                const isPastDate = new Date(selectedDate) < new Date(format(new Date(), 'yyyy-MM-dd'));
                const isPresent = !!record?.time_in;
                const isAbsent = !isPresent;
                const isActionLoading = actionLoading === employee.id;
                const isSelected = selectedIds.includes(employee.id);

                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    key={employee.id} 
                    className={`bg-white rounded-2xl shadow-sm border p-4 flex flex-col h-full relative transition-all duration-200 ${isSelected ? 'border-indigo-500 ring-1 ring-indigo-500 shadow-md' : 'border-gray-200 hover:border-gray-300 hover:shadow-md'}`}
                  >
                  {/* Selection Checkbox */}
                  <div className="absolute top-4 left-4 z-10">
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={() => toggleSelection(employee.id)}
                      className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                    />
                  </div>

                  {isPresent || record?.status === 'absent' ? (
                    <button
                      onClick={() => record?.status === 'absent' ? handleMarkPresent(employee.id, record?.id) : handleDeleteRecord(employee.id, record!.id)}
                      disabled={isActionLoading}
                      className="absolute top-3 right-3 text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 z-10"
                      title={record?.status === 'absent' ? "Mark Present" : "Delete Attendance Record"}
                    >
                      {record?.status === 'absent' ? <CheckSquare className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleMarkAbsent(employee.id, record?.id)}
                      disabled={isActionLoading}
                      className="absolute top-3 right-3 text-gray-400 hover:text-amber-600 p-1.5 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50 z-10"
                      title="Mark Absent"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  
                  {/* Define hasTimedOut here */}
                  {(() => {
                    const hasTimedOut = !!record?.time_out;
                    return (
                      <div className="flex flex-col h-full space-y-3">
                        <div className="flex items-center justify-between pl-8 pr-8">
                          <div className="flex items-center space-x-2">
                            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center border border-indigo-100">
                              <span className="text-indigo-600 font-semibold text-xs">
                                {employee.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="text-sm font-medium text-gray-900 truncate max-w-[100px] sm:max-w-[130px]">
                              {employee.name}
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                              isPresent
                                ? 'bg-green-100 text-green-600'
                                : 'bg-amber-50 text-amber-600'
                            }`}
                          >
                            {isPresent ? 'Present' : 'Absent'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors flex-grow" onClick={() => toggleSelection(employee.id)}>
                          <div className='text-center'>
                            <span className="block text-xs text-gray-500 mb-0.5">Time In</span>
                            <span className="text-lg font-semibold text-gray-900">
                              {record?.time_in ? format(new Date(record.time_in), 'hh:mm a') : '--:--'}
                            </span>
                          </div>
                          <div className='text-center'>
                            <span className="block text-xs text-gray-500 mb-0.5">Time Out</span>
                            <span className="text-lg font-semibold text-gray-900">
                              {record?.time_out ? format(new Date(record.time_out), 'hh:mm a') : '--:--'}
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-1 mt-auto">
                          <button
                            onClick={() => handleTimeIn(employee.id)}
                            disabled={isPresent || isActionLoading}
                            className={`flex-1 inline-flex justify-center items-center px-3 py-2 text-sm font-medium rounded-xl shadow-sm text-white transition-all hover:scale-102 ${
                              isPresent
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                                : 'bg-indigo-500 hover:bg-indigo-600'
                            }`}
                          >
                            {isActionLoading && !isPresent ? (
                              <Loader2 className="animate-spin h-4 w-4 mr-2" />
                            ) : (
                              <LogIn className="h-4 w-4 mr-2" />
                            )}
                            Time In
                          </button>
                          <button
                            onClick={() => handleTimeOut(employee.id, record.id)}
                            disabled={!isPresent || hasTimedOut || isActionLoading}
                            className={`flex-1 inline-flex justify-center items-center px-3 py-2 text-sm font-medium rounded-xl shadow-sm text-white transition-all hover:scale-102 ${
                              !isPresent || hasTimedOut
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                                : 'bg-orange-500 hover:bg-orange-600'
                            }`}
                          >
                            {isActionLoading && isPresent && !hasTimedOut ? (
                              <Loader2 className="animate-spin h-4 w-4 mr-2" />
                            ) : (
                              <LogOut className="h-4 w-4 mr-2" />
                            )}
                            Time Out
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

