-- Run this in your Supabase SQL Editor

-- Create employees table
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  daily_rate numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Create attendance table
CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  time_in timestamp with time zone,
  time_out timestamp with time zone,
  status text DEFAULT 'present'
);

-- Add unique constraint to ensure one attendance record per employee per day
ALTER TABLE attendance ADD CONSTRAINT unique_employee_date UNIQUE (employee_id, date);

-- Enable Row Level Security (RLS)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Create holidays table
CREATE TABLE IF NOT EXISTS holidays (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  date date NOT NULL UNIQUE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('regular', 'special')),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS for holidays
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations for holidays" ON holidays FOR ALL USING (true) WITH CHECK (true);

-- Create containers table
CREATE TABLE IF NOT EXISTS containers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visual_code TEXT NOT NULL,
  kar_code TEXT UNIQUE,
  type TEXT CHECK (type IN ('local', 'foreign')) NOT NULL,
  status TEXT NOT NULL,
  platform_number INTEGER CHECK (platform_number BETWEEN 1 AND 6),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for containers
ALTER TABLE containers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations for containers" ON containers FOR ALL USING (true) WITH CHECK (true);
