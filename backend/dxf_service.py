import os
import uuid
import asyncio
import ezdxf

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "static", "downloads")

async def create_dxf_from_coords(coords_data: dict) -> str:
    """
    Шаг 3: ezdxf
    Построение действительного 2D чертежа (.dxf файла) по координатам.
    Возвращает URL или путь к сгенерированному файлу.
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    filename = f"floorplan_{uuid.uuid4().hex[:8]}.dxf"
    filepath = os.path.join(OUTPUT_DIR, filename)
    
    # Имитация асинхронной работы
    await asyncio.sleep(0.5)
    
    try:
        doc = ezdxf.new('R2010')
        msp = doc.modelspace()
        
        refined_coords = coords_data.get("refined_coordinates", [])
        for item in refined_coords:
            if item.get("type") == "wall":
                start = item.get("start")
                end = item.get("end")
                msp.add_line(start, end)
                
        doc.saveas(filepath)
        return f"/downloads/{filename}"
    except Exception as e:
        print(f"Ошибка при генерации DXF: {e}")
        return ""
