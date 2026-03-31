import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Users, CheckCircle, XCircle, Loader2, Download, Briefcase, Receipt, ArrowRight, Clock, Paintbrush, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { exportToCSV } from '../lib/export';

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0 });
  const [projectStats, setProjectStats] = useState<any[]>([]);
  const [billingList, setBillingList] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchDashboardData();

    // Set up real-time subscription for attendance
    const attendanceChannel = supabase
      .channel('dashboard_attendance')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance',
          filter: `date=eq.${selectedDate}`
        },
        () => {
          // For simplicity, we refetch everything when a change occurs.
          // This ensures stats are correctly re-calculated.
          fetchDashboardData();
        }
      )
      .subscribe();

    // Set up real-time subscription for employees (to update total count)
    const employeesChannel = supabase
      .channel('dashboard_employees')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'employees'
        },
        () => {
          fetchDashboardData();
        }
      )
      .subscribe();

    // Set up real-time subscription for containers
    const containersChannel = supabase
      .channel('dashboard_containers')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'containers'
        },
        () => {
          fetchDashboardData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(attendanceChannel);
      supabase.removeChannel(employeesChannel);
      supabase.removeChannel(containersChannel);
    };
  }, [selectedDate]);

  async function fetchDashboardData() {
    try {
      setLoading(true);

      // 1. Get total employees
      const { count: totalEmployees, error: empError } = await supabase
        .from('employees')
        .select('*', { count: 'exact', head: true });

      if (empError) throw empError;

      // 2. Get attendance for selected date
      const { data: attendanceData, error: attError } = await supabase
        .from('attendance')
        .select('status')
        .eq('date', selectedDate);

      if (attError) throw attError;

      const presentCount = attendanceData?.filter(a => a.status === 'present').length || 0;
      const absentCount = (totalEmployees || 0) - presentCount;

      setStats({
        total: totalEmployees || 0,
        present: presentCount,
        absent: absentCount
      });

      // 3. Get Project Overview (Container Stats)
      const { data: containersData, error: contError } = await supabase
        .from('containers')
        .select('status');

      if (contError) throw contError;

      const statusCounts = containersData?.reduce((acc: any, curr: any) => {
        acc[curr.status] = (acc[curr.status] || 0) + 1;
        return acc;
      }, {});

      const overview = Object.entries(statusCounts || {}).map(([status, count]) => ({
        status,
        count
      }));
      setProjectStats(overview);

      // 4. Get Billing List
      const { data: billingData, error: billError } = await supabase
        .from('containers')
        .select('*')
        .in('status', ['BILLING', 'BILLED'])
        .order('updated_at', { ascending: false });

      if (billError) throw billError;
      setBillingList(billingData || []);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'WASHING': return <Clock className="w-4 h-4 text-blue-500" />;
      case 'REPAIR': return <Clock className="w-4 h-4 text-amber-500" />;
      case 'PRIMER PAINT':
      case 'SECONDARY PAINT': return <Paintbrush className="w-4 h-4 text-indigo-500" />;
      case 'VISUAL INSPECT':
      case 'FINAL INSPECT': return <Search className="w-4 h-4 text-emerald-500" />;
      case 'BILLING':
      case 'BILLED': return <Receipt className="w-4 h-4 text-purple-500" />;
      default: return <Clock className="w-4 h-4" />;
    }
  }

  function handleExport() {
    const exportData = billingList.map(c => ({
      Code: c.kar_code || c.visual_code,
      Type: c.type,
      Status: c.status,
      Platform: c.platform_number,
      LastUpdate: format(new Date(c.updated_at), 'MMM dd, yyyy')
    }));

    exportToCSV(exportData, `billing_list_${selectedDate}`);
  }

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.1, duration: 0.4 }
    })
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-7xl mx-auto p-4 space-y-6"
    >
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 leading-relaxed">Dashboard</h2>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-sm text-gray-500 leading-relaxed">Overview of attendance and employee metrics.</p>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm border px-4 py-2 cursor-pointer"
            />
          </div>
        </div>
        <button
          onClick={handleExport}
          className="inline-flex justify-center items-center px-4 py-2.5 border border-gray-200 text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 transition-colors"
        >
          <Download className="w-5 h-5 mr-2" />
          Export
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <motion.div custom={0} initial="hidden" animate="visible" variants={cardVariants} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 font-medium leading-relaxed">Total Employees</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
            <Users className="w-6 h-6 text-indigo-500" />
          </div>
        </motion.div>

        <motion.div custom={1} initial="hidden" animate="visible" variants={cardVariants} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 font-medium leading-relaxed">Present on {format(new Date(selectedDate), 'MMM dd')}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.present}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-green-500" />
          </div>
        </motion.div>

        <motion.div custom={2} initial="hidden" animate="visible" variants={cardVariants} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 font-medium leading-relaxed">Absent on {format(new Date(selectedDate), 'MMM dd')}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.absent}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <XCircle className="w-6 h-6 text-red-500" />
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project Overview */}
        <motion.div custom={3} initial="hidden" animate="visible" variants={cardVariants} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-indigo-600" />
              Project Overview
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {projectStats.length === 0 ? (
              <p className="col-span-2 text-center py-8 text-gray-400 text-sm">No active projects</p>
            ) : (
              projectStats.map((stat, i) => (
                <div key={stat.status} className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      {getStatusIcon(stat.status)}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{stat.status}</p>
                      <p className="text-xl font-bold text-gray-900">{stat.count}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* Billing List */}
        <motion.div custom={4} initial="hidden" animate="visible" variants={cardVariants} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-purple-600" />
              Billing List
            </h3>
            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-full uppercase">
              {billingList.length} Items
            </span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {billingList.length === 0 ? (
              <div className="p-12 text-center">
                <Receipt className="w-12 h-12 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No containers in billing</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {billingList.map((item) => (
                  <div key={item.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        item.status === 'BILLED' ? 'bg-emerald-50 text-emerald-600' : 'bg-purple-50 text-purple-600'
                      }`}>
                        <Briefcase className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{item.kar_code || item.visual_code}</p>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">{item.type} • Platform {item.platform_number}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider ${
                        item.status === 'BILLED' ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {item.status}
                      </span>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {format(new Date(item.updated_at), 'MMM dd')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
