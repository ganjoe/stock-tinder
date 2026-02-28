import os
import signal
import subprocess
import time

def kill_port_8051():
    print("Checking for processes on port 8051...")
    try:
        # Find processes using port 8051
        # -t: terse output (only PIDs)
        result = subprocess.check_output(["lsof", "-t", "-i:8051"]).decode().strip()
        if result:
            pids = result.split("\n")
            print(f"Found processes on port 8051: {', '.join(pids)}")
            for pid in pids:
                try:
                    pid_int = int(pid)
                    print(f"Killing process {pid_int}...")
                    os.kill(pid_int, signal.SIGTERM)
                    # Give it a moment to terminate
                    time.sleep(0.5)
                except (ValueError, ProcessLookupError) as e:
                    print(f"Error killing process {pid}: {e}")
            print("Successfully cleared port 8051.")
        else:
            print("No processes found on port 8051.")
    except subprocess.CalledProcessError:
        # lsof returns exit code 1 if no matches are found
        print("No processes found on port 8051.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    kill_port_8051()
