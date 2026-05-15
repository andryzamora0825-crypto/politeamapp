@echo off
chcp 65001 >nul
echo =========================================
echo 🚀 Subiendo cambios a GitHub (PoliTeam)
echo =========================================
echo.

:: Inicializar git si no existe
if not exist ".git" (
    echo Inicializando repositorio local...
    git init
)

:: Agregar los cambios
echo Agregando archivos...
git add .

:: Pedir mensaje de commit
set /p commit_msg="Escribe un mensaje para el commit (Presiona Enter para mensaje por defecto): "
if "%commit_msg%"=="" set commit_msg="Actualización automática y mejoras UI"

:: Hacer commit
git commit -m "%commit_msg%"

:: Renombrar rama a main por si acaso
git branch -M main

:: Añadir remoto (se ignora el error si ya existe)
git remote add origin https://github.com/andryzamora0825-crypto/politeamapp.git 2>nul

:: Hacer push
echo.
echo Empujando cambios al servidor...
git push -u origin main

echo.
echo =========================================
echo ✅ ¡Subida completada con éxito!
echo =========================================
pause
