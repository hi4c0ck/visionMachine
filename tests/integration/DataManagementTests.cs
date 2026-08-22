using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace VisionMachine.Tests.Integration
{
    /// <summary>
    /// Integration tests for VisionMachine data management system
    /// Tests all CRUD operations, relationships, and edge cases
    /// </summary>
    public class DataManagementTests : IDisposable
    {
        private readonly TestDbContext _context;
        private readonly string _testDbPath;

        public DataManagementTests()
        {
            _testDbPath = Path.Combine(Path.GetTempPath(), $"visionmachine_test_{Guid.NewGuid()}.db");
            _context = new TestDbContext(_testDbPath);
            _context.Initialize();
        }

        public void Dispose()
        {
            _context?.Dispose();
            if (File.Exists(_testDbPath))
                File.Delete(_testDbPath);
        }

        #region Profile Tests

        [Fact]
        public async Task CreateProfile_ValidData_ReturnsProfile()
        {
            // Act
            var profile = await _context.CreateProfileAsync("John Doe", "john@example.com");

            // Assert
            Assert.NotNull(profile);
            Assert.Equal("John Doe", profile.Name);
            Assert.Equal("john@example.com", profile.Email);
            Assert.NotEmpty(profile.Id);
        }

        [Fact]
        public async Task ListProfiles_ReturnsAllProfiles()
        {
            // Arrange
            await _context.CreateProfileAsync("User 1", null);
            await _context.CreateProfileAsync("User 2", null);

            // Act
            var profiles = await _context.ListProfilesAsync();

            // Assert
            Assert.Equal(2, profiles.Count);
        }

        [Fact]
        public async Task LogoutUser_ClearsActiveSessions()
        {
            // Arrange
            var profile = await _context.CreateProfileAsync("Test User", null);
            var project = await _context.CreateProjectAsync(profile.Id, "Project");
            var session = await _context.CreateSessionAsync(project.Id, "Session");

            // Act
            await _context.LogoutUserAsync();

            // Assert
            var updatedSession = await _context.GetSessionAsync(session.Id);
            Assert.Equal("idle", updatedSession.State);
            Assert.Null(updatedSession.LastAccessed);
        }

        #endregion

        #region Project Tests

        [Fact]
        public async Task CreateProject_ValidData_ReturnsProject()
        {
            // Arrange
            var profile = await _context.CreateProfileAsync("User", null);

            // Act
            var project = await _context.CreateProjectAsync(profile.Id, "My Project", "Description");

            // Assert
            Assert.NotNull(project);
            Assert.Equal("My Project", project.Name);
            Assert.Equal(profile.Id, project.ProfileId);
        }

        [Fact]
        public async Task DeleteProject_CascadesToDeleteSessions()
        {
            // Arrange
            var profile = await _context.CreateProfileAsync("User", null);
            var project = await _context.CreateProjectAsync(profile.Id, "Project");
            var session = await _context.CreateSessionAsync(project.Id, "Session");

            // Act
            await _context.DeleteProjectAsync(project.Id);

            // Assert
            var deletedSession = await _context.GetSessionAsync(session.Id);
            Assert.Null(deletedSession);
        }

        [Fact]
        public async Task DeleteProject_CascadesToDeleteComposers()
        {
            // Arrange
            var profile = await _context.CreateProfileAsync("User", null);
            var project = await _context.CreateProjectAsync(profile.Id, "Project");
            var session = await _context.CreateSessionAsync(project.Id, "Session");
            await _context.GetComposerAsync(session.Id);

            // Act
            await _context.DeleteProjectAsync(project.Id);

            // Assert
            var db = new SqliteConnection($"Data Source={_testDbPath}");
            await db.OpenAsync();
            var cmd = db.CreateCommand();
            cmd.CommandText = "SELECT COUNT(*) FROM composers";
            var count = Convert.ToInt32(cmd.ExecuteScalar());
            Assert.Equal(0, count);
        }

        #endregion

        #region Session Tests

        [Fact]
        public async Task CreateSession_ValidData_ReturnsSession()
        {
            // Arrange
            var profile = await _context.CreateProfileAsync("User", null);
            var project = await _context.CreateProjectAsync(profile.Id, "Project");

            // Act
            var session = await _context.CreateSessionAsync(project.Id, "First Session");

            // Assert
            Assert.NotNull(session);
            Assert.Equal("First Session", session.Name);
            Assert.Equal("idle", session.State);
        }

        [Fact]
        public async Task UpdateSessionState_InvalidState_ThrowsException()
        {
            // Arrange
            var profile = await _context.CreateProfileAsync("User", null);
            var project = await _context.CreateProjectAsync(profile.Id, "Project");
            var session = await _context.CreateSessionAsync(project.Id, "Session");

            // Act & Assert
            await Assert.ThrowsAsync<ArgumentException>(() => 
                _context.UpdateSessionStateAsync(session.Id, "invalid_state"));
        }

        [Fact]
        public async Task UpdateSessionState_ValidState_Succeeds()
        {
            // Arrange
            var profile = await _context.CreateProfileAsync("User", null);
            var project = await _context.CreateProjectAsync(profile.Id, "Project");
            var session = await _context.CreateSessionAsync(project.Id, "Session");

            // Act
            await _context.UpdateSessionStateAsync(session.Id, "generating");

            // Assert
            var updated = await _context.GetSessionAsync(session.Id);
            Assert.Equal("generating", updated.State);
        }

        #endregion

        #region Composer Tests

        [Fact]
        public async Task GetComposer_NonExistent_AutoCreatesEmptyComposer()
        {
            // Arrange
            var profile = await _context.CreateProfileAsync("User", null);
            var project = await _context.CreateProjectAsync(profile.Id, "Project");
            var session = await _context.CreateSessionAsync(project.Id, "Session");

            // Act
            var composer = await _context.GetComposerAsync(session.Id);

            // Assert
            Assert.NotNull(composer);
            Assert.Equal(session.Id, composer.SessionId);
            Assert.Equal(1, composer.Version);
            Assert.Contains("pipes", composer.ConfigJson);
        }

        [Fact]
        public async Task UpdateComposer_ValidJson_UpdatesSuccessfully()
        {
            // Arrange
            var profile = await _context.CreateProfileAsync("User", null);
            var project = await _context.CreateProjectAsync(profile.Id, "Project");
            var session = await _context.CreateSessionAsync(project.Id, "Session");
            var composer = await _context.GetComposerAsync(session.Id);

            // Act
            var updated = await _context.UpdateComposerAsync(session.Id, 
                "{\"pipes\":[{\"id\":\"p1\"}],\"state\":\"ready\"}");

            // Assert
            Assert.Equal(2, updated.Version);
            Assert.Contains("ready", updated.ConfigJson);
        }

        #endregion

        #region Artifact Tests

        [Fact]
        public async Task CreateArtifact_ValidData_ReturnsArtifact()
        {
            // Arrange
            var profile = await _context.CreateProfileAsync("User", null);
            var project = await _context.CreateProjectAsync(profile.Id, "Project");
            var session = await _context.CreateSessionAsync(project.Id, "Session");

            // Act
            var artifact = await _context.CreateArtifactAsync(
                session.Id, project.Id, profile.Id, "video", "/output/video.mp4", null);

            // Assert
            Assert.NotNull(artifact);
            Assert.Equal("video", artifact.ArtifactType);
            Assert.Equal("/output/video.mp4", artifact.FilePath);
        }

        [Fact]
        public async Task ListArtifactsBySession_ReturnsCorrectArtifacts()
        {
            // Arrange
            var profile = await _context.CreateProfileAsync("User", null);
            var project = await _context.CreateProjectAsync(profile.Id, "Project");
            var session = await _context.CreateSessionAsync(project.Id, "Session");
            
            await _context.CreateArtifactAsync(session.Id, null, null, "image", "/img1.png", null);
            await _context.CreateArtifactAsync(session.Id, null, null, "video", "/vid1.mp4", null);

            // Act
            var artifacts = await _context.ListArtifactsBySessionAsync(session.Id);

            // Assert
            Assert.Equal(2, artifacts.Count);
        }

        #endregion

        #region Concurrent Access Tests

        [Fact]
        public async Task ConcurrentProfileCreations_AllSucceed()
        {
            // Arrange
            var tasks = new List<Task>();
            for (int i = 0; i < 10; i++)
            {
                tasks.Add(_context.CreateProfileAsync($"User {i}", null));
            }

            // Act
            await Task.WhenAll(tasks);

            // Assert
            var profiles = await _context.ListProfilesAsync();
            Assert.Equal(10, profiles.Count);
        }

        [Fact]
        public async Task ConcurrentProjectCreations_AllSucceed()
        {
            // Arrange
            var profile = await _context.CreateProfileAsync("User", null);
            var tasks = new List<Task>();
            for (int i = 0; i < 10; i++)
            {
                tasks.Add(_context.CreateProjectAsync(profile.Id, $"Project {i}"));
            }

            // Act
            await Task.WhenAll(tasks);

            // Assert
            var projects = await _context.ListProjectsAsync(profile.Id);
            Assert.Equal(10, projects.Count);
        }

        #endregion

        #region Database Stats Tests

        [Fact]
        public async Task GetDatabaseStats_ReturnsValidStats()
        {
            // Act
            var stats = await _context.GetDatabaseStatsAsync();

            // Assert
            Assert.True(stats.PageCount > 0);
            Assert.True(stats.PageSize > 0);
            Assert.Equal("wal", stats.JournalMode.ToLower());
            Assert.True(stats.SizeMb >= 0);
        }

        [Fact]
        public async Task DatabaseUsesWALMode()
        {
            // Act
            var stats = await _context.GetDatabaseStatsAsync();

            // Assert
            Assert.Equal("wal", stats.JournalMode.ToLower());
        }

        #endregion

        #region Full Workflow Test

        [Fact]
        public async Task FullWorkflow_CompletesSuccessfully()
        {
            // 1. Create profile
            var profile = await _context.CreateProfileAsync("Alice Johnson", "alice@test.com");
            Assert.NotNull(profile);

            // 2. Create project
            var project = await _context.CreateProjectAsync(profile.Id, "Video Project", "My first project");
            Assert.NotNull(project);

            // 3. Create session
            var session = await _context.CreateSessionAsync(project.Id, "First Edit");
            Assert.NotNull(session);
            Assert.Equal("idle", session.State);

            // 4. Get composer (auto-creates)
            var composer = await _context.GetComposerAsync(session.Id);
            Assert.NotNull(composer);
            Assert.Equal(1, composer.Version);

            // 5. Update composer
            var updatedComposer = await _context.UpdateComposerAsync(session.Id, 
                "{\"pipes\":[{\"id\":\"p1\",\"name\":\"Opening\"}],\"state\":\"ready\"}");
            Assert.Equal(2, updatedComposer.Version);

            // 6. Create artifact
            var artifact = await _context.CreateArtifactAsync(
                session.Id, project.Id, profile.Id, "video", "/output/render.mp4", null);
            Assert.NotNull(artifact);

            // 7. Check stats
            var stats = await _context.GetDatabaseStatsAsync();
            Assert.True(stats.SizeMb >= 0);

            // 8. Logout clears sessions
            await _context.LogoutUserAsync();
            var loggedOutSession = await _context.GetSessionAsync(session.Id);
            Assert.Equal("idle", loggedOutSession.State);

            // 9. Verify cascade delete works
            await _context.DeleteProjectAsync(project.Id);
            var deletedSession = await _context.GetSessionAsync(session.Id);
            Assert.Null(deletedSession);
        }

        #endregion
    }
}
