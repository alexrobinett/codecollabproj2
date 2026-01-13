import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Typography,
  Button,
  Box,
  Card,
  CardContent,
  CardActions,
  CardMedia,
  Grid,
  TextField,
  InputAdornment,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Search, Add, Code, People, CalendarToday } from '@mui/icons-material';
import { useProjects } from '../hooks/projects';
import { useAuth } from '../hooks/auth';
import EmptyState from '../components/common/EmptyState';

const ProjectList = () => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const projectRefs = useRef({});

  // TanStack Query hook
  const { 
    data: projects = [], 
    isLoading, 
    error,
    refetch 
  } = useProjects();

  // Scroll to project card if hash is present
  useEffect(() => {
    if (window.location.hash) {
      const id = window.location.hash.replace('#', '');
      setTimeout(() => {
        if (projectRefs.current[id]) {
          projectRefs.current[id].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 200); // Wait for render
    }
  }, [projects]);

  const filteredProjects = useMemo(() => 
    projects.filter(project =>
      project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (project.technologies && project.technologies.some(tech => 
        tech.toLowerCase().includes(searchTerm.toLowerCase())
      ))
    ), [projects, searchTerm]
  );

  if (isLoading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ mt: 4 }}>
          <Alert 
            severity="error" 
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                Retry
              </Button>
            }
          >
            Failed to load projects: {error.message}
          </Alert>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
          <Typography variant="h4" component="h1">
            Projects
          </Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            component={RouterLink}
            to="/projects/create"
          >
            Create Project
          </Button>
        </Box>

        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search projects..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 4 }}
        />

        <Grid container spacing={3}>
          {filteredProjects.map((project) => (
            <Grid item xs={12} sm={6} md={4} key={project._id} ref={el => projectRefs.current[project._id] = el}>
              <Card>
                {project.image && (
                  <CardMedia
                    component="img"
                    height="200"
                    image={`http://localhost:5000${project.image}`}
                    alt={project.title}
                    sx={{ objectFit: 'cover' }}
                  />
                )}
                <CardContent>
                  <Typography variant="h6" component="h2" gutterBottom>
                    {project.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {project.description}
                  </Typography>
                  <Box sx={{ mb: 2 }}>
                    {project.technologies && project.technologies.map((tech) => (
                      <Chip
                        key={tech}
                        label={tech}
                        size="small"
                        sx={{ mr: 1, mb: 1 }}
                      />
                    ))}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, color: 'text.secondary' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <People sx={{ fontSize: 16, mr: 0.5 }} />
                      <Typography variant="body2">
                        {project.collaborators ? project.collaborators.length : 0}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <CalendarToday sx={{ fontSize: 16, mr: 0.5 }} />
                      <Typography variant="body2">
                        {new Date(project.createdAt).toLocaleDateString()}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
                <CardActions>
                  <Button size="small" component={RouterLink} to={`/projects/${project._id}`}>
                    View Details
                  </Button>
                  {project.owner && project.owner._id === user?._id && (
                    <Button size="small" component={RouterLink} to={`/projects/${project._id}/edit`}>
                      Edit
                    </Button>
                  )}
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>

        {filteredProjects.length === 0 && (
          projects.length === 0 ? (
            <EmptyState
              type="projects"
              title="No projects yet"
              description="Be the first to create a project and start collaborating with the community!"
              actionLabel="Create Project"
              actionHref="/projects/create"
            />
          ) : (
            <EmptyState
              type="search"
              title="No projects found"
              description="Try adjusting your search terms or create a new project."
              actionLabel="Clear Search"
              onAction={() => setSearchTerm('')}
            />
          )
        )}
      </Box>
    </Container>
  );
};

export default ProjectList; 