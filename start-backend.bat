@echo off
wsl -e bash -c "cd /mnt/c/DDN/AI-Dev/Projects/infinia-object-store-validator/backend && python3 -m uvicorn main:app --host 0.0.0.0 --port 8003 --reload"
