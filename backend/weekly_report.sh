#!/bin/bash
# TekaTeka Weekly Report Cron Job
# Runs every Friday at 20:00 (8 PM)

# Call the backend endpoint to trigger the weekly report
# Needs ADMIN_PASSWORD in the environment (same value as the app Secret)
curl -X POST -H "X-Admin-Password: ${ADMIN_PASSWORD}" http://localhost:8001/api/reports/send-report

echo "Weekly report triggered at $(date)"
