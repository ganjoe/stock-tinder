import os
import glob

def clean_indikator_cache():
    market_dir = "./data/market_cache"
    search_pattern = os.path.join(market_dir, "*", "indikator.json")
    
    files_to_delete = glob.glob(search_pattern)
    print(f"Gefunden: {len(files_to_delete)} indikator.json Dateien.")
    
    deleted_count = 0
    for file_path in files_to_delete:
        try:
            os.remove(file_path)
            deleted_count += 1
        except Exception as e:
            print(f"Fehler beim Löschen von {file_path}: {e}")
            
    print(f"Erfolgreich gelöscht: {deleted_count} indikator.json Dateien.")

if __name__ == "__main__":
    clean_indikator_cache()
