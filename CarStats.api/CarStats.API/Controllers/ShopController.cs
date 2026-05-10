using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;
using CarStats.API.Models;

namespace CarStats.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ShopsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public ShopsController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<MechanicShop>>> GetShops()
        {
            return await _context.MechanicShops.ToListAsync();
        }

        [HttpPost]
        public async Task<ActionResult<MechanicShop>> PostShop(MechanicShop shop)
        {
            _context.MechanicShops.Add(shop);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetShops), new { id = shop.Id }, shop);
        }
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteShop(int id)
        {
            var shop = await _context.MechanicShops.FindAsync(id);
            if (shop == null) return NotFound();

            _context.MechanicShops.Remove(shop);
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
}