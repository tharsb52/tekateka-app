#!/bin/bash
# TekaTeka Weekly Report Cron Job
# Runs every Friday at 20:00 (8 PM)

# Call the backend endpoint to trigger the weekly report
curl -X POST http://localhost:8001/api/reports/send-report

echo "Weekly report triggered at $(date)"
