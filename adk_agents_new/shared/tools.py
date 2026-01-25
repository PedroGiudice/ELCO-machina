import subprocess
import os
import glob
import logging

def run_shell_cmd(command: str, timeout: int = 300) -> str:
    """
    Executa comandos de shell de forma segura e retorna output estruturado.
    Captura stdout e stderr.
    """
    print(f"[$] {command}")
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=os.getcwd()
        )
        
        output = f"EXIT CODE: {result.returncode}\n"
        if result.stdout:
            output += f"STDOUT:\n{result.stdout.strip()}\n"
        if result.stderr:
            output += f"STDERR:\n{result.stderr.strip()}\n"
            
        return output
    except subprocess.TimeoutExpired:
        return f"ERROR: Command '{command}' timed out after {timeout}s"
    except Exception as e:
        return f"ERROR: Execution failed: {str(e)}"

def read_file_secure(filepath: str) -> str:
    """Lê arquivo com tratamento de erro."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        return content
    except Exception as e:
        return f"ERROR reading {filepath}: {str(e)}"

def find_files_glob(pattern: str, recursive: bool = True) -> str:
    """Encontra arquivos via glob."""
    try:
        files = glob.glob(pattern, recursive=recursive)
        if not files:
            return "No files found."
        return "\n".join(files[:100]) # Limit to 100
    except Exception as e:
        return f"ERROR globbing {pattern}: {str(e)}"
